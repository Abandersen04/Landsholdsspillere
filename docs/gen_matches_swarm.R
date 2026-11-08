#!/usr/bin/env Rscript
# Beeswarm-graf: antal landskampe pr. herrelandsholdsspiller, grupperet efter
# fødselsårgang. Stilmæssig reference: "I want to ride my bicycle" (FT-stil).
#
# Kør fra docs/-mappen (eller juster DATA_PATH/OUT_PATH):
#   Rscript gen_matches_swarm.R

library(jsonlite)
library(ggplot2)
library(ggbeeswarm)
library(ggrepel)
library(dplyr)

HERE <- normalizePath(dirname(sub("--file=", "", grep("--file=", commandArgs(trailingOnly = FALSE), value = TRUE))))
if (length(HERE) == 0 || is.na(HERE)) HERE <- getwd()

DATA_PATH <- file.path(HERE, "herrespillere-kampe-data.json")
OUT_PATH  <- file.path(HERE, "herrespillere-kampe-aargange-R.png")

data <- fromJSON(DATA_PATH)
eras <- data$eras
df <- data$players
df$era <- factor(df$era, levels = rev(eras))  # rev so 1900-1925 plots at top

# ---- Palette (dataviz skill, categorical slots 1-5, light mode) ----
colors <- c(
  "1900–1925" = "#2a78d6",  # blue
  "1926–1950" = "#eb6834",  # orange
  "1951–1975" = "#1baf7a",  # aqua
  "1976–2000" = "#eda100",  # yellow
  "2001–2025" = "#e87ba4"   # magenta
)
INK            <- "#0b0b0b"
INK_SECONDARY  <- "#52514e"
INK_MUTED      <- "#898781"
SURFACE        <- "#fcfcfb"
PAGE           <- "#f9f9f7"
GRID           <- "#e1e0d9"

# ---- Top-N labelled players per era (1 bold + 4 secondary) ----
TOP_N <- 5
top_df <- df %>%
  group_by(era) %>%
  slice_max(order_by = matches, n = TOP_N, with_ties = FALSE) %>%
  mutate(rank = rank(-matches, ties.method = "first")) %>%
  ungroup() %>%
  mutate(is_top1 = rank == 1)

counts <- df %>% count(era)
note_line1 <- paste(sprintf("%s: %d spillere", eras, counts$n[match(eras, counts$era)]), collapse = " · ")
note_line2 <- "Nyeste årgang (2001–2025) er stadig aktive og har spillet færre kampe, da deres karriere ikke er slut endnu."

xmax <- max(df$matches)
ticks <- c(0, 25, 50, 75, 100, 125, 150)
ticks <- ticks[ticks <= xmax + 10]

p <- ggplot(df, aes(x = matches, y = era, color = era)) +
  geom_quasirandom(groupOnX = FALSE, size = 1.1, alpha = 0.9, width = 0.38) +
  geom_point(
    data = subset(top_df, !is_top1), aes(x = matches, y = era),
    shape = 21, fill = PAGE, color = INK_SECONDARY, size = 2.6, stroke = 0.7
  ) +
  geom_point(
    data = subset(top_df, is_top1), aes(x = matches, y = era, fill = era),
    color = INK, size = 4.4, shape = 21, stroke = 1.1
  ) +
  geom_text_repel(
    data = subset(top_df, !is_top1), aes(x = matches, y = era, label = name),
    color = INK_SECONDARY, size = 3.1, fontface = "plain",
    family = "sans", bg.color = PAGE, bg.r = 0.12,
    direction = "y", seed = 42, max.overlaps = Inf,
    point.padding = 4, box.padding = 0.3,
    segment.color = INK_MUTED, segment.size = 0.3, min.segment.length = 0.3
  ) +
  geom_text_repel(
    data = subset(top_df, is_top1), aes(x = matches, y = era, label = name),
    color = INK, size = 3.6, fontface = "bold",
    family = "sans", bg.color = PAGE, bg.r = 0.12,
    nudge_y = 0.32, direction = "x", seed = 42, max.overlaps = Inf,
    point.padding = 5, box.padding = 0.2,
    segment.color = INK_MUTED, segment.size = 0.3, min.segment.length = 0.3
  ) +
  scale_color_manual(values = colors, guide = "none") +
  scale_fill_manual(values = colors, guide = "none") +
  scale_x_continuous(
    position = "top", breaks = ticks, limits = c(-18, xmax + 15),
    expand = expansion(mult = c(0, 0.02))
  ) +
  scale_y_discrete(expand = expansion(add = 0.7)) +
  labs(
    title = "Flere kampe, hvis du er født sent",
    subtitle = "Antal landskampe for herrelandsholdsspillere, efter fødselsårgang",
    caption = paste0(note_line1, "\n", note_line2)
  ) +
  theme_minimal(base_family = "sans") +
  theme(
    plot.background   = element_rect(fill = PAGE, color = NA),
    panel.background  = element_rect(fill = PAGE, color = NA),
    plot.title        = element_text(size = 22, face = "bold", color = INK, margin = margin(b = 4)),
    plot.subtitle     = element_text(size = 13, color = INK_SECONDARY, margin = margin(b = 14)),
    plot.caption      = element_text(size = 8.5, color = INK_MUTED, hjust = 0, margin = margin(t = 14)),
    axis.title        = element_blank(),
    axis.text.y       = element_text(size = 12.5, face = "bold", color = INK, hjust = 1),
    axis.text.x       = element_text(size = 10, color = INK_MUTED),
    axis.ticks        = element_blank(),
    panel.grid.major.x = element_line(color = GRID, linewidth = 0.4),
    panel.grid.major.y = element_blank(),
    panel.grid.minor   = element_blank(),
    plot.margin        = margin(18, 24, 14, 10)
  )

ggsave(OUT_PATH, plot = p, width = 14.5, height = 10.5, dpi = 200, bg = PAGE)
cat("Gemt:", OUT_PATH, "\n")
print(counts)
