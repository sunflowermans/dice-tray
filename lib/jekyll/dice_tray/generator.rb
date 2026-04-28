module Jekyll
  module DiceTray
    class Generator < Jekyll::Generator
      safe true
      priority :low

      def generate(site)
        cfg = (site.config["dice_tray"] || {})
        return if cfg["enabled"] == false

        assets_path = cfg["assets_path"] || "/assets/jekyll-dice-tray"
        assets_path = "/#{assets_path}" unless assets_path.start_with?("/")

        asset_dir = File.expand_path("../../../assets/jekyll-dice-tray", __dir__)

        files = {
          "dice_tray.js" => File.join(asset_dir, "dice_tray.js"),
          "dice_tray.css" => File.join(asset_dir, "dice_tray.css"),
        }

        files.each do |name, source_path|
          next unless File.file?(source_path)
          site.static_files << AssetFile.new(
            site,
            site.source,
            assets_path.sub(%r{\A/}, ""),
            name,
            source_path: source_path
          )
        end
      end
    end
  end
end

