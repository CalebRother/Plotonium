# FILE: Biostats_Functions/group_comparisons.R

# Dependencies
library(ggpubr)
library(rstatix)
library(dplyr)
library(rlang)
library(scales)
library(ggplot2)
library(purrr)
library(rcompanion)


group_comparison <- function(data, response_col, group1_col, group2_col = NULL,
                             parametric       = FALSE,
                             p_label_style    = "letters",
                             show_test_name   = TRUE,
                             plot_title       = NULL,
                             xlab             = NULL,
                             ylab             = NULL,
                             palette          = "npg",
                             label_size       = 3.8,
                             hide_ns          = FALSE) {
  
  # --- 1. Capture Column Names as Strings ---
  # This approach is robust and works well across different packages.
  response_str <- as_name(enquo(response_col))
  group1_str   <- as_name(enquo(group1_col))
  group2_str   <- if (!quo_is_null(enquo(group2_col))) as_name(enquo(group2_col)) else NULL
  
  # Ensure grouping columns are factors using the string names
  data <- data %>%
    mutate(!!group1_str := as.factor(.data[[group1_str]]))
  if (!is.null(group2_str)) {
    data <- data %>% mutate(!!group2_str := as.factor(.data[[group2_str]]))
  }
  
  # --- 2. Branch for Analysis Type (One-Way vs. Two-Way) ---
  is_two_way <- !is.null(group2_str)
  
  if (is_two_way) {
    # --- Two-Way Analysis ---
    ## --- FINAL FIX ---
    # The formula is now created using as.formula() with strings.
    # This is a highly compatible method that resolves the environment errors.
    form <- as.formula(paste(response_str, "~", group1_str, "*", group2_str))
    
    # Formula for post-hoc tests also needs to be created this way.
    post_hoc_form <- as.formula(paste(response_str, "~", group1_str))
    
    if (parametric) {
      main_res <- data %>% anova_test(form)
      post_res <- data %>%
        group_by(!!group2_str) %>%
        tukey_hsd(formula = post_hoc_form)
      test_name <- "Two-Way ANOVA"
    } else {
      main_res <- scheirerRayHare(form, data = data)
      post_res <- data %>%
        group_by(!!group2_str) %>%
        dunn_test(formula = post_hoc_form, p.adjust.method = "holm")
      test_name <- "Scheirer-Ray-Hare Test"
    }
    
    plt <- ggboxplot(data, x = group1_str, y = response_str, color = group1_str, palette = palette, add = "jitter") +
      facet_wrap(as.formula(paste("~", group2_str)))
    
    post_res <- post_res %>% add_xy_position(x = group1_str)
    plot_subtitle <- if (show_test_name) paste("Main Test:", test_name) else NULL
    
  } else {
    # --- One-Way Analysis ---
    ## --- FINAL FIX ---
    # The formula is now created using as.formula() with strings.
    form <- as.formula(paste(response_str, "~", group1_str))
    
    if (parametric) {
      main_res <- data %>% anova_test(form)
      post_res <- data %>% tukey_hsd(form)
      test_name <- "One-Way ANOVA & Tukey's HSD"
    } else {
      main_res <- data %>% kruskal_test(form)
      post_res <- data %>% dunn_test(form, p.adjust.method = "holm")
      test_name <- "Kruskal-Wallis & Dunn's Test"
    }
    
    plt <- ggboxplot(data, x = group1_str, y = response_str, color = group1_str, palette = palette, add = "jitter")
    
    post_res <- post_res %>% add_xy_position(x = group1_str)
    plot_subtitle <- if (show_test_name) test_name else NULL
  }
  
  # --- 3. Finalize and Print Plot & Results ---
  p_adj_col <- if ("p.adj" %in% names(post_res)) "p.adj" else "p"
  p_signif_col <- if ("p.adj.signif" %in% names(post_res)) "p.adj.signif" else "p.signif"
  
  post_res$plot_label <- switch(
    p_label_style,
    both      = paste0("p=", pvalue(post_res[[p_adj_col]]), "\n", post_res[[p_signif_col]]),
    "p.value" = pvalue(post_res[[p_adj_col]]),
    post_res[[p_signif_col]]
  )
  
  plt <- plt +
    theme_minimal() +
    theme(legend.position = "none") +
    labs(
      title    = plot_title %||% paste("Comparison of", response_str, "by", group1_str, if(is_two_way) paste("and", group2_str) else ""),
      subtitle = plot_subtitle,
      x        = xlab %||% group1_str,
      y        = ylab %||% response_str
    ) +
    stat_pvalue_manual(
      post_res,
      label      = "plot_label",
      tip.length = 0.01,
      hide.ns    = hide_ns,
      vjust      = -0.5,
      size       = label_size
    ) +
    coord_cartesian(ylim = c(NA, max(post_res$y.position, na.rm = TRUE) * 1.18), clip = "off") +
    theme(plot.margin = margin(1, 1, 1, 1, "cm"))
  
  
  print(plt)
  message("\nMain Test Results:")
  print(main_res)
  message("\nPost-Hoc Results:")
  print(post_res)
  
  invisible(list(
    plot              = plt,
    main_test_results = main_res,
    post_hoc_results  = post_res
  ))
}