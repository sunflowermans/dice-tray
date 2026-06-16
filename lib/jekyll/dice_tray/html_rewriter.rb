module Jekyll
  module DiceTray
    module HtmlRewriter
      DICE_RE = /
        (?<![A-Za-z0-9_])
        (?:
          (?:\d{1,3})?d\d{1,4}
          (?:\s*[+-]\s*\d{1,5})?
          (?:
            \s*[+-]\s*(?:\d{1,3})?d\d{1,4}
            (?:\s*[+-]\s*\d{1,5})?
          )?
        )
        (?![A-Za-z0-9_])
      /x

      CHANCE_RE = /
        (?<![A-Za-z0-9_])
        \d{1,3}
        \s*-\s*in\s*-\s*
        \d{1,4}
        (?![A-Za-z0-9_])
      /ix

      THAC0_WORD_RE = /THAC0/i

      BRACKET_INNER_RE = /
        [+-]?
        \d{1,5}
        (?:\s*[+-]\s*\d{1,5})*
      /x

      # "THAC0 18 [+1]" in one run of text — link the inner "+1", roll d20+1.
      THAC0_INLINE_RE = /
        THAC0\s*:?\s*
        \d{1,2}
        \s*
        \[
        \s*
        (?<mod>#{BRACKET_INNER_RE})
        \s*
        \]
      /ix

      # "18 [+1]" in a THAC0 table row or under a THAC0 column header.
      THAC0_VALUE_BRACKET_RE = /
        (?<!\d)
        \d{1,2}
        \s*
        \[
        \s*
        (?<mod>#{BRACKET_INNER_RE})
        \s*
        \]
      /x

      SKIP_ANCESTORS = %w[pre code a script style textarea].freeze

      def self.bracket_mod_to_roll_expr(inner)
        compact = inner.gsub(/\s+/, "")
        mod = 0
        compact.scan(/[+-]?\d+/) { |term| mod += term.to_i }
        return "d20" if mod.zero?

        mod.positive? ? "d20+#{mod}" : "d20#{mod}"
      end

      def self.thac0_row_context?(node)
        tr = node.ancestors.find { |a| a.element? && a.name == "tr" }
        tr && tr.text.match?(THAC0_WORD_RE)
      end

      def self.thac0_table_context?(node)
        return false unless node.ancestors.any? { |a| a.element? && a.name == "td" }

        table = node.ancestors.find { |a| a.element? && a.name == "table" }
        return false unless table

        caption = table.at_css("caption")
        return true if caption&.text&.match?(THAC0_WORD_RE)

        first_row = table.at_css("tr")
        first_row && first_row.text.match?(THAC0_WORD_RE)
      end

      def self.thac0_bracket_context?(node)
        thac0_row_context?(node) || thac0_table_context?(node)
      end

      def self.bracket_mod_hit(text, m)
        {
          start: m.begin(0),
          end: m.end(0),
          expr: bracket_mod_to_roll_expr(m[:mod]),
          label_start: m.begin(:mod),
          label_end: m.end(:mod),
          prefix: text[m.begin(0)...m.begin(:mod)],
          suffix: text[m.end(:mod)...m.end(0)],
        }
      end

      def self.collect_roll_matches(text, node)
        matches = []

        text.to_enum(:scan, DICE_RE).each do
          m = Regexp.last_match
          matches << {
            start: m.begin(0),
            end: m.end(0),
            expr: m[0],
            label_start: m.begin(0),
            label_end: m.end(0),
          }
        end

        text.to_enum(:scan, CHANCE_RE).each do
          m = Regexp.last_match
          matches << {
            start: m.begin(0),
            end: m.end(0),
            expr: m[0].gsub(/\s+/, ""),
            label_start: m.begin(0),
            label_end: m.end(0),
          }
        end

        text.to_enum(:scan, THAC0_INLINE_RE).each do
          matches << bracket_mod_hit(text, Regexp.last_match)
        end

        if thac0_bracket_context?(node)
          text.to_enum(:scan, THAC0_VALUE_BRACKET_RE).each do
            matches << bracket_mod_hit(text, Regexp.last_match)
          end
        end

        matches.sort_by! { |hit| hit[:start] }
        accepted = []
        matches.each do |hit|
          next if accepted.any? { |prev| hit[:start] < prev[:end] && hit[:end] > prev[:start] }

          accepted << hit
        end
        accepted
      end

      def self.rewrite(html)
        frag = Nokogiri::HTML::DocumentFragment.parse(html)

        frag.traverse do |node|
          next unless node.text?
          next if node.content.nil? || node.content.empty?
          next if node.ancestors.any? { |a| SKIP_ANCESTORS.include?(a.name) }

          text = node.content
          hits = collect_roll_matches(text, node)
          next if hits.empty?

          new_nodes = []
          last = 0

          hits.each do |hit|
            start_idx = hit[:start]
            end_idx = hit[:end]

            new_nodes << Nokogiri::XML::Text.new(text[last...start_idx], frag.document) if start_idx > last

            if hit[:prefix]
              new_nodes << Nokogiri::XML::Text.new(hit[:prefix], frag.document) if !hit[:prefix].empty?

              a = Nokogiri::XML::Node.new("a", frag.document)
              a["href"] = "#"
              a["class"] = "dice-tray-roll"
              a["data-dice"] = hit[:expr]
              a.content = text[hit[:label_start]...hit[:label_end]]
              new_nodes << a

              new_nodes << Nokogiri::XML::Text.new(hit[:suffix], frag.document) if !hit[:suffix].empty?
            else
              a = Nokogiri::XML::Node.new("a", frag.document)
              a["href"] = "#"
              a["class"] = "dice-tray-roll"
              a["data-dice"] = hit[:expr]
              a.content = text[hit[:label_start]...hit[:label_end]]
              new_nodes << a
            end

            last = end_idx
          end

          new_nodes << Nokogiri::XML::Text.new(text[last..], frag.document) if last < text.length

          node.replace(new_nodes.map(&:to_html).join)
        end

        frag.to_html
      end

      def self.inject_tray(html, assets_path:)
        return html if html.include?('data-dice-tray-root="true"')

        tray = <<~HTML
          <div id="jekyll-dice-tray" data-dice-tray-root="true" aria-live="polite">
            <div class="jdt-header">
              <button type="button" class="jdt-toggle" aria-expanded="false" title="Toggle dice tray">Dice</button>
            </div>
            <div class="jdt-body" hidden>
              <div class="jdt-clue">Type <code>1d20+5</code> or <code>/help</code>, then press Enter.</div>
              <div class="jdt-log" role="log" aria-label="Dice roll log"></div>
              <input class="jdt-input" type="text" inputmode="text" autocomplete="off" spellcheck="false"
                placeholder="Roll: 1d6, d4, 2d8+1, /help" />
            </div>
          </div>
        HTML

        tags = <<~HTML
          <link rel="stylesheet" href="#{assets_path}/dice_tray.css" />
          <script defer src="#{assets_path}/dice_tray.js"></script>
        HTML

        if html.include?("</body>")
          html.sub("</body>", "#{tray}\n#{tags}\n</body>")
        else
          "#{html}\n#{tray}\n#{tags}\n"
        end
      end
    end
  end
end

