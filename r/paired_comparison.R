# r/paired_comparison.R

# Load all necessary libraries for the function to work
library(dplyr)
library(rlang)
library(tidyr)
library(ggplot2)
library(rstatix)
library(scales)
library(ggpubr)

paired_comparison <- function(data,
                              before_col,
                              after_col,
                              parametric       = FALSE,
                              plot_title       = NULL,
                              xlab             = NULL,
                              ylab             = "Value",
                              before_label     = NULL,
                              after_label      = NULL,
                              show_paired_lines= TRUE,
                              before_color     = NULL,
                              after_color      = NULL) {
  # capture the column names
  before_q <- enquo(before_col)
  after_q  <- enquo(after_col)
  before_str <- as_name(before_q)
  after_str  <- as_name(after_q)

  # pivot to long form
  data_long <- data %>%
    mutate(subject_id = row_number()) %>%
    pivot_longer(
      cols      = c(!!before_q, !!after_q),
      names_to  = "time",
      values_to = "value"
    ) %>%
    drop_na(value)

  # set factor levels (and optional custom labels)
  if (!is.null(before_label) && !is.null(after_label)) {
    data_long$time <- factor(
      data_long$time,
      levels = c(before_str, after_str),
      labels = c(before_label, after_label)
    )
  } else {
    data_long$time <- factor(data_long$time, levels = c(before_str, after_str))
  }

  # choose parametric vs non‐parametric
  if (parametric) {
    stats_res <- data_long %>%
      t_test(value ~ time, paired = TRUE) %>%
      add_significance("p")
    test_name <- "Paired t-Test"
  } else {
    stats_res <- data_long %>%
      wilcox_test(value ~ time, paired = TRUE) %>%
      add_significance("p")
    test_name <- "Wilcoxon Signed-Rank Test"
  }

  # position for the bracket
  stat.test <- stats_res %>%
    add_xy_position(x = "time") %>%
    mutate(y.position = max(data_long$value, na.rm = TRUE) * 1.05)

  # build the ggplot
  if (is.null(plot_title)) plot_title <- paste("Change from", before_str, "to", after_str)
  if (is.null(xlab))        xlab       <- "Time Point"

  p <- ggplot(data_long, aes(x = time, y = value)) +
    geom_boxplot(aes(fill = time), alpha = 0.7, outlier.shape = NA) +
    { if (show_paired_lines)
        geom_line(aes(group = subject_id), color = "grey70", alpha = 0.5)
      else NULL } +
    geom_point(aes(color = time), position = position_jitter(width = 0.15), alpha = 0.8) +
    stat_pvalue_manual(
      stat.test,
      label       = "p.signif",
      tip.length  = 0.01,
      symnum.args = list(
        cutpoints = c(0, 1e-4, 1e-3, 1e-2, 0.05, 1),
        symbols   = c("****","***","**","*","ns")
      )
    ) +
    theme_minimal() +
    theme(legend.position = "none") +
    labs(title = plot_title, subtitle = test_name, x = xlab, y = ylab) +
    scale_y_continuous(expand = expansion(mult = c(0.05, 0.15)))

  if (!is.null(before_color) && !is.null(after_color)) {
    p <- p +
      scale_fill_manual(values = c(before_color, after_color)) +
      scale_color_manual(values = c(before_color, after_color))
  }

  # --- draw the plot ---
  print(p)

  # --- cat() the statistics summary ---
  cat(
    "Paired Analysis Results:\n",
    "  Method:    ", test_name, "\n",
    "  Statistic: ", round(stat.test$statistic, 2), "\n",
    "  p-value:   ", format.pval(stat.test$p, digits = 3, eps = 0.001), "\n",
    sep = ""
  )

  # invisible return so nothing else gets printed
  invisible(NULL)
}
