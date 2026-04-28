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

      SKIP_ANCESTORS = %w[pre code a script style textarea].freeze

      def self.rewrite(html)
        frag = Nokogiri::HTML::DocumentFragment.parse(html)

        frag.traverse do |node|
          next unless node.text?
          next if node.content.nil? || node.content.empty?
          next if node.ancestors.any? { |a| SKIP_ANCESTORS.include?(a.name) }

          text = node.content
          next unless text.match?(DICE_RE)

          new_nodes = []
          last = 0

          text.to_enum(:scan, DICE_RE).each do
            m = Regexp.last_match
            start_idx = m.begin(0)
            end_idx = m.end(0)
            expr = m[0]

            new_nodes << Nokogiri::XML::Text.new(text[last...start_idx], frag.document) if start_idx > last

            a = Nokogiri::XML::Node.new("a", frag.document)
            a["href"] = "#"
            a["class"] = "dice-tray-roll"
            a["data-dice"] = expr
            a.content = expr
            new_nodes << a

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

