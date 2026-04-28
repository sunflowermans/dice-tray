Gem::Specification.new do |spec|
  spec.name = "jekyll-dice-tray"
  spec.version = File.read(File.expand_path("lib/jekyll/dice_tray/version.rb", __dir__))
    .match(/VERSION\s*=\s*"([^"]+)"/)[1]
  spec.authors = ["directsun"]
  spec.email = []

  spec.summary = "Jekyll plugin that adds an overlay dice tray and clickable dice rolls."
  spec.homepage = "https://github.com/directsun/jekyll-dice-tray"
  spec.license = "MIT"

  spec.required_ruby_version = ">= 3.0"

  spec.files = Dir.glob("{lib,assets}/**/*") + %w[LICENSE README.md]
  spec.require_paths = ["lib"]

  spec.add_dependency "jekyll", ">= 3.7", "< 5.0"
  spec.add_dependency "nokogiri", ">= 1.14"
end

