module Jekyll
  module DiceTray
    module Config
      DEFAULT_ASSETS_PATH = "/assets/jekyll-dice-tray"

      # Site-relative directory for writing static assets (no baseurl).
      def self.assets_dir(site)
        path = configured_path(site)
        path.sub(%r{\A/}, "")
      end

      # URL path for linking assets in HTML (includes baseurl).
      def self.assets_url(site)
        baseurl = site.config["baseurl"].to_s.chomp("/")
        "#{baseurl}#{configured_path(site)}"
      end

      def self.configured_path(site)
        cfg = site.config["dice_tray"] || {}
        path = (cfg["assets_path"] || DEFAULT_ASSETS_PATH).to_s
        path.start_with?("/") ? path : "/#{path}"
      end
      private_class_method :configured_path
    end
  end
end
