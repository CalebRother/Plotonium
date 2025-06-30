# Load all necessary libraries for the function to work
library(dplyr)
library(rlang)
library(ggplot2)
library(rstatix)
library(scales)
library(ggpubr)

paired_comparison <- function(data, before_col, after_col, parametric = FALSE, plot_title = NULL, xlab = NULL, ylab = "Value", before_label = NULL, after_label = NULL, show_paired_lines = TRUE, before_color = NULL, after_color = NULL) {
  
  before_str <- rlang::as_name(rlang::enquo(before_col))
  after_str <- rlang::as_name(rlang::enquo(after_col))
  
  data$subject_id <- 1:nrow(data)
  data_clean <- data
  data_clean$difference <- data_clean[[after_str]] - data_clean[[before_str]]
  data_subset <- data_clean[, c("subject_id", before_str, after_str, "difference")]
  data_clean <- na.omit(data_subset)
  
  if (nrow(data_clean) == 0) {
    stop("No complete pairs of data found after removing NAs.")
  }
  
  set.seed(42)
  data_clean$x_jitter_amount <- runif(nrow(data_clean), -0.15, 0.15)
  
  # Perform the Statistical Test
  if (parametric) {
    stats_res <- data_clean %>% rstatix::t_test(difference ~ 1, mu = 0)
    test_name <- "Paired t-Test"
  } else {
    stats_res <- data_clean %>% rstatix::wilcox_test(difference ~ 1, mu = 0)
    test_name <- "Wilcoxon Signed-Rank Test"
  }
  
  # Reshape data for plotting
  df_before <- data.frame(subject_id = data_clean$subject_id, time = before_str, value = data_clean[[before_str]], x_jitter_amount = data_clean$x_jitter_amount)
  df_after <- data.frame(subject_id = data_clean$subject_id, time = after_str, value = data_clean[[after_str]], x_jitter_amount = data_clean$x_jitter_amount)
  data_long <- rbind(df_before, df_after)
  data_long$time <- factor(data_long$time, levels = c(before_str, after_str))

  if (!is.null(before_label) && !is.null(after_label)) {
    levels(data_long$time) <- c(before_label, after_label)
  }
  
  # Prepare the p-value data for plotting
  stat.test <- stats_res %>%
    rstatix::add_significance("p") %>%
    rstatix::add_xy_position(x = "time") %>%
    mutate(y.position = max(data_long$value, na.rm = TRUE) * 1.05) 

  # Build the Plot
  if (is.null(plot_title)) plot_title <- paste("Change from", before_str, "to", after_str)
  if (is.null(xlab)) xlab <- "Time Point"
  
  p <- ggplot2::ggplot(data_long, ggplot2::aes(x = time, y = value)) +
    geom_boxplot(aes(fill = time), alpha = 0.7, outlier.shape = NA) +
    geom_line(aes(x = as.numeric(time) + x_jitter_amount, group = subject_id), color = "grey70", alpha = 0.5) +
    geom_point(aes(x = as.numeric(time) + x_jitter_amount, color = time), alpha = 0.8) +
    ggpubr::stat_pvalue_manual(
      stat.test,
      label = "p.signif",
      tip.length = 0.01,
      symnum.args = list(cutpoints = c(0, 0.0001, 0.001, 0.01, 0.05, 1), symbols = c("****", "***", "**", "*", "ns"))
    ) +
    theme_minimal() +
    theme(legend.position = "none") +
    labs(
      title = plot_title,
      subtitle = test_name,
      x = xlab,
      y = ylab
    ) +
    ggplot2::scale_y_continuous(expand = expansion(mult = c(0.05, 0.15)))

  if (!is.null(before_color) && !is.null(after_color)) {
    p <- p +
      scale_color_manual(values = c(before_color, after_color)) +
      scale_fill_manual(values = c(before_color, after_color))
  }
  
  # --- THE FIX: Return a structured list instead of printing ---
  return(list(plot = p, stats = stats_res))
}
