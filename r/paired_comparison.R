# FILE: Biostats_Functions/paired_ttest.R

paired_comparison <- function(data, before_col, after_col,
                              parametric = FALSE,
                              plot_title = NULL,
                              xlab = NULL,
                              ylab = "Value",
                              before_label = NULL,
                              after_label = NULL,
                              show_paired_lines = TRUE,
                              before_color = NULL,
                              after_color = NULL) {
  # --- 1. Handle Inputs & Prepare Data ---
  before_str <- as_name(enquo(before_col))
  after_str <- as_name(enquo(after_col))
  
  ## --- IMPROVEMENT ---
  # Added input validation to ensure the specified columns are numeric.
  # This prevents cryptic errors if the wrong columns are chosen.
  if (!is.numeric(data[[before_str]]) || !is.numeric(data[[after_str]])) {
    stop("Error: Both 'before_col' and 'after_col' must be numeric.")
  }
  
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
  
  # --- 2. Perform the Statistical Test ---
  if (parametric) {
    stats_res <- data_clean %>% t_test(difference ~ 1, mu = 0)
    test_name <- "Paired t-Test"
  } else {
    stats_res <- data_clean %>% wilcox_test(difference ~ 1, mu = 0)
    test_name <- "Wilcoxon Signed-Rank Test"
  }
  
  # --- 3. Prepare Data for Plotting ---
  data_long <- data_clean %>%
    select(-difference) %>%
    pivot_longer(
      cols = c(all_of(before_str), all_of(after_str)),
      names_to = "time",
      values_to = "value"
    ) %>%
    mutate(time = factor(time, levels = c(before_str, after_str)))
  
  if (!is.null(before_label) && !is.null(after_label)) {
    levels(data_long$time) <- c(before_label, after_label)
  }
  
  # --- 4. Build the Plot ---
  if (is.null(plot_title)) plot_title <- paste("Change from", before_str, "to", after_str)
  if (is.null(xlab)) xlab <- "Time Point"
  
  p_value_formatted <- pvalue(stats_res$p, accuracy = 0.001, add_p = TRUE)
  plot_subtitle <- paste(test_name, ", ", p_value_formatted, sep = "")
  
  p <- ggplot(data_long, aes(y = value))
  
  if (show_paired_lines) {
    p <- p + geom_line(
      aes(x = as.numeric(time) + x_jitter, group = subject_id),
      color = "grey70", alpha = 0.5
    )
  }
  
  p <- p + geom_point(
    aes(x = as.numeric(time) + x_jitter, color = time),
    alpha = 0.8
  )
  
  p <- p + geom_boxplot(
    aes(x = as.numeric(time), fill = time, group = time),
    alpha = 0.7, outlier.shape = NA
  )
  
  p <- p +
    theme_minimal() +
    theme(legend.position = "none") +
    scale_x_continuous(breaks = 1:2, labels = levels(data_long$time)) +
    labs(
      title = plot_title,
      subtitle = plot_subtitle,
      x = xlab,
      y = ylab
    )
  
  if (!is.null(before_color) && !is.null(after_color)) {
    level_names <- levels(data_long$time)
    custom_colors <- c(before_color, after_color)
    names(custom_colors) <- level_names
    
    p <- p +
      scale_color_manual(values = custom_colors) +
      scale_fill_manual(values = custom_colors)
  }
  
  # --- 5. Print Outputs and Return Invisibly ---
  print(p)
  
  message("\nPaired Analysis Results:")
  print(stats_res)
  
  invisible(list(plot = p, stats_results = stats_res))
}
