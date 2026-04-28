module Jekyll
  module DiceTray
    module Hooks
      def self.register!
        Jekyll::Hooks.register(%i[pages documents], :post_render) do |doc|
          site = doc.site
          cfg = (site.config["dice_tray"] || {})
          next if cfg["enabled"] == false
          next unless doc.respond_to?(:output_ext) && doc.output_ext == ".html"

          assets_path = cfg["assets_path"] || "/assets/jekyll-dice-tray"
          assets_path = "/#{assets_path}" unless assets_path.start_with?("/")

          begin
            out = doc.output.to_s
            out = HtmlRewriter.rewrite(out) if cfg.fetch("link_dice_in_markdown", true)
            out = HtmlRewriter.inject_tray(out, assets_path: assets_path) if cfg.fetch("inject_tray", true)
            doc.output = out
          rescue StandardError => e
            Jekyll.logger.warn("jekyll-dice-tray:", "Failed to process #{doc.relative_path}: #{e.class}: #{e.message}")
          end
        end
      end
    end
  end
end

Jekyll::DiceTray::Hooks.register!

