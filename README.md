# jekyll-dice-tray

A Jekyll plugin gem that:

- Adds a **bottom-right overlay dice tray** (starts minimized; expands on click).
- Recognizes dice expressions in rendered pages like `d4`, `1d6`, `1d20+1` and turns them into **clickable links** that roll in the tray.
- Supports `/help` in the tray input.

## Install

Add to your site `Gemfile`:

```ruby
gem "jekyll-dice-tray"
```

Then in `_config.yml`:

```yml
plugins:
  - jekyll-dice-tray
```

## Configuration

Optional `_config.yml` settings:

```yml
dice_tray:
  enabled: true
  assets_path: /assets/jekyll-dice-tray
  inject_tray: true
  link_dice_in_markdown: true
```

## Test in the Cairn docs project

In `~/projects/cairn` (docs site), add this plugin as a path gem.

1) Edit `~/projects/cairn/Gemfile` (or the docs Gemfile if it’s in a subdir) and add:

```ruby
gem "jekyll-dice-tray", path: "/home/chris/projects/dice-tray"
```

2) Add to the docs `_config.yml`:

```yml
plugins:
  - jekyll-dice-tray
```

3) Run:

```bash
bundle install
bundle exec jekyll serve
```

Now any text like `1d20+1` in your markdown should render as a clickable roll, and the tray should appear bottom-right.

