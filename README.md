# jekyll-dice-tray

A Jekyll plugin gem that:

- Adds an overlay dice tray that accepts dice rolling input
- Recognizes dice expressions in rendered pages like `d4`, `1d6`, `1d20+1` and turns them into clickable links that roll in the tray
- Clicking a lookup-table die (any `dN`) rolls and shows the matching entry — supports any number of side-by-side key/value column groups, ranges like `3–12`, and tables with or without headers. One die in the header searches the whole table; multiple dice each search their own column group
- Persists input history, result history, minimize status

https://github.com/user-attachments/assets/6ef8d788-a1ee-49d4-ab26-f63899bb4a10

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
  assets_path: /assets/jekyll-dice-tray  # prefixed with site baseurl automatically
  inject_tray: true
  link_dice_in_markdown: true
```
