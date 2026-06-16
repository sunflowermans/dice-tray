# jekyll-dice-tray

A Jekyll plugin gem that:

- Adds an overlay dice tray that accepts dice rolling input
- Recognizes dice expressions in rendered pages like `d4`, `1d6`, `1d20+1` and turns them into clickable links that roll in the tray
- Recognizes THAC0-style bracket modifiers like `THAC0 18 [+1]` or `18 [+1]` in a THAC0 table row/column; the `+1` inside the brackets is clickable and rolls `d20+1` (other `[+n]` text is left alone)
- Rolls from table dice links show the roll result plus each column header and cell value from that table row
- Clicking a lookup-table die in the header row (e.g. `1d12` on an encounter table) rolls the dice and shows the row whose leftmost number matches the result
- Persists input history, result history, minimize status
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
