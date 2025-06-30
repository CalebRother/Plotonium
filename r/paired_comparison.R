# Load all necessary libraries for the function to work
library(dplyr)
library(rlang)
library(ggplot2)
library(rstatix)
library(scales)
library(ggpubr) # Added for stat_compare_means

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
  data_clean$x_jitter <- runif(nrow(data_clean), min = -0.2, max = 0.2)
  
  # --- Perform the Statistical Test ---
  if (parametric) {
    stats_res <- data_clean %>% rstatix::t_test(difference ~ 1, mu = 0)
    test_name <- "Paired t-Test"
  } else {
    stats_res <- data_clean %>% rstatix::wilcox_test(difference ~ 1, mu = 0)
    test_name <- "Wilcoxon Signed-Rank Test"
  }
  
  # --- Reshape data using Base R ---
  df_before <- data.frame(subject_id = data_clean$subject_id, time = before_str, value = data_clean[[before_str]], x_jitter = data_clean$x_jitter)
  df_after <- data.frame(subject_id = data_clean$subject_id, time = after_str, value = data_clean[[after_str]], x_jitter = data_clean$x_jitter)
  data_long <- rbind(df_before, df_after)
  data_long$time <- factor(data_long$time, levels = c(before_str, after_str))

  if (!is.null(before_label) && !is.null(after_label)) {
    levels(data_long$time) <- c(before_label, after_label)
  }
  
  # --- Build the Plot ---
  if (is.null(plot_title)) plot_title <- paste("Change from", before_str, "to", after_str)
  if (is.null(xlab)) xlab <- "Time Point"
  
  p <- ggplot2::ggplot(data_long, ggplot2::aes(x = time, y = value))
  
  if (show_paired_lines) {
    p <- p + ggplot2::geom_line(
      ggplot2::aes(group = subject_id),
      color = "grey70", alpha = 0.5
    )
  }
  
  p <- p +
    ggplot2::geom_boxplot(ggplot2::aes(fill = time), alpha = 0.7, outlier.shape = NA) +
    ggplot2::geom_jitter(ggplot2::aes(color = time), width = 0.1, alpha = 0.8)
  
  # --- THIS IS THE UPDATED SIGNIFICANCE SECTION ---
  p <- p + ggpubr::stat_compare_means(
    method = if (parametric) "t.test" else "wilcox.test",
    paired = TRUE,
    comparisons = list(c(before_str, after_str)),
    # Define the custom map from p-values to symbols
    symnum.args = list(
        cutpoints = c(0, 0.0001, 0.001, 0.01, 0.05, 1),
        symbols = c("****", "***", "**", "*", "ns")
    )
  )
  
  p <- p +
    ggplot2::theme_minimal() +
    ggplot2::theme(legend.position = "none") +
    ggplot2::labs(
      title = plot_title,
      subtitle = test_name,
      x = xlab,
      y = ylab
    )
  
  if (!is.null(before_color) && !is.null(after_color)) {
    level_names <- levels(data_long$time)
    custom_colors <- c(before_color, after_color)
    names(custom_colors) <- level_names
    
    p <- p +
      ggplot2::scale_color_manual(values = custom_colors) +
      ggplot2::scale_fill_manual(values = custom_colors)
  }
  
  print(p)
  message("\\nPaired Analysis Results:")
  print(stats_res)
  
  invisible(list(plot = p, stats_results = stats_res))
}
