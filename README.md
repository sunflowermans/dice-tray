# jekyll-dice-tray

A Jekyll plugin gem that:

- Adds an overlay dice tray that accepts dice rolling input
- Recognizes dice expressions in rendered pages like `d4`, `1d6`, `1d20+1` and turns them into clickable links that roll in the tray
- Persists input history, result history, minimize status
.
- `/help` - help
- `/clear` - clears results and input history

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
