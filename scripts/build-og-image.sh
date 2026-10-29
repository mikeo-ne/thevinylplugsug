#!/usr/bin/env bash
# Builds the social share card (1200x630) used for og:image / WhatsApp previews.
# Pure ImageMagick primitives so it runs anywhere without an SVG rasteriser.
set -euo pipefail

OUT="${1:-public/og-image.png}"
TMP="$(mktemp -d)"
mkdir -p "$(dirname "$OUT")"
BOLD=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
REG=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
LIME='#CCFF00'
INK='#121212'
BONE='#F4F4EF'
MUTED='#8E8E86'

# ---------- glow layer ----------
convert -size 1200x630 xc:none \
  -fill "rgba(204,255,0,0.22)" -draw "circle 980,20 980,470" \
  -blur 0x110 "$TMP/glow.png"

# ---------- record ----------
GROOVES=""
for r in 248 232 216 200 184 168 152 136 120 106 92; do
  GROOVES="${GROOVES}stroke rgba(255,255,255,0.07) stroke-width 1 fill none circle 260,260 $((260+r)),260
"
done

convert -size 520x520 xc:none \
  -fill "#0a0a09" -draw "circle 260,260 516,260" \
  -draw "$GROOVES" \
  -stroke none -fill "$LIME" -draw "circle 260,260 336,260" \
  -stroke "rgba(18,18,18,0.16)" -strokewidth 2 -fill none -draw "circle 260,260 330,260" \
  -stroke none -fill "$INK" -draw "circle 260,260 267,260" \
  -font "$BOLD" -pointsize 42 -fill "$INK" -annotate +232+276 "7H" \
  "$TMP/vinyl.png"

# subtle specular sheen
convert "$TMP/vinyl.png" \
  \( -size 520x520 xc:none -fill "rgba(255,255,255,0.10)" -draw "circle 160,120 160,20" -blur 0x60 \) \
  -compose over -composite "$TMP/vinyl-sheen.png"

# ---------- grid ----------
GRID=""
for y in 80 160 240 320 400 480 560; do GRID="${GRID}line 0,${y} 1200,${y}
"; done
for x in 80 160 240 320 400 480 560 640 720 800 880 960 1040 1120; do GRID="${GRID}line ${x},0 ${x},630
"; done

# ---------- compose ----------
convert -size 1200x630 xc:"$INK" \
  "$TMP/glow.png" -compose screen -composite \
  -fill none -stroke "rgba(255,255,255,0.045)" -strokewidth 1 -draw "$GRID" \
  "$TMP/base.png"

# text segments are laid out individually so kerning/spacing stays exact
seg() { # font size color text out
  convert -background none -font "$1" -pointsize "$2" -fill "$3" label:"$4" \
    -bordercolor none -border 2 "$5"
}
seg "$BOLD" 62 "$BONE" "Press Your Sound" "$TMP/l1.png"
seg "$BOLD" 62 "$BONE" "on" "$TMP/l2a.png"
seg "$BOLD" 62 "$LIME" "Vinyl" "$TMP/l2b.png"
seg "$BOLD" 62 "$BONE" "." "$TMP/l2c.png"
seg "$BOLD" 42 "#E9E9E2" "Zero Risk, Global Delivery." "$TMP/l3.png"
seg "$REG" 20 "$MUTED" "Turnkey vinyl production & brokerage · East Africa" "$TMP/l4.png"

w2a=$(identify -format %w "$TMP/l2a.png")
w2b=$(identify -format %w "$TMP/l2b.png")

convert "$TMP/base.png" "$TMP/vinyl-sheen.png" -geometry +730+52 -composite \
  -fill "$LIME" -draw "rectangle 0,0 1200,6" \
  "$TMP/l1.png" -geometry +78+232 -composite \
  "$TMP/l2a.png" -geometry +78+314 -composite \
  "$TMP/l2b.png" -geometry +$((78 + w2a + 4))+314 -composite \
  "$TMP/l2c.png" -geometry +$((78 + w2a + w2b + 4))+314 -composite \
  "$TMP/l3.png" -geometry +80+424 -composite \
  "$TMP/l4.png" -geometry +82+498 -composite \
  "$TMP/card.png"

# ---------- brand lockup ----------
convert "$TMP/card.png" \
  -fill none -stroke "rgba(255,255,255,0.22)" -strokewidth 2 -draw "circle 106,112 106,85" \
  -stroke none -fill "$LIME" -draw "circle 106,112 106,100" \
  -fill "$INK" -draw "circle 106,112 106,108" \
  -font "$BOLD" -pointsize 24 -fill "$BONE" -annotate +146+112 "7H" \
  -fill "$LIME" -annotate +184+112 "." \
  -font "$REG" -pointsize 11 -fill "$MUTED" -annotate +147+132 "MUSIC GROUP" \
  "$TMP/branded.png"

# ---------- pills ----------
convert "$TMP/branded.png" \
  -fill none -stroke "rgba(204,255,0,0.38)" -strokewidth 1.5 \
  -draw "roundrectangle 80,538 286,582 22,22" \
  -draw "roundrectangle 302,538 508,582 22,22" \
  -draw "roundrectangle 524,538 706,582 22,22" \
  -stroke none -fill "$LIME" -font "$REG" -pointsize 16 \
  -annotate +103+567 "100 – 500 unit runs" \
  -annotate +325+567 "7–11 week press" \
  -annotate +547+567 "MoMo & Airtel" \
  "$OUT"

rm -rf "$TMP"
identify "$OUT"
