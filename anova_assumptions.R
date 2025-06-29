# FILE: Biostats_Functions/check_anova_assumptions.R

## --- IMPROVEMENT ---
# Added rstatix and dplyr libraries to be consistent with other functions
# and to provide the pvalue() function.
library(rstatix)
library(dplyr)
library(car) # For Levene's Test

#' @title Check Assumptions for a Parametric ANOVA
#' @description Performs Shapiro-Wilk and Levene's tests and provides a
#'              recommendation for using a parametric or non-parametric test.
#'
#' @param data The input dataframe.
#' @param formula A formula specifying the model (e.g., response ~ group1 * group2).

check_anova_assumptions <- function(data, formula) {
  # --- 1. Fit Model ---
  model <- tryCatch(
    aov(formula, data = data),
    error = function(e) {
      stop("Failed to fit ANOVA model. Please check your formula and data.", call. = FALSE)
    }
  )
  
  # --- 2. Perform Formal Tests ---
  
  # Test 1: Normality of Residuals
  shapiro_test_result <- shapiro.test(residuals(model))
  shapiro_p_value <- shapiro_test_result$p.value
  is_normal <- shapiro_p_value > 0.05
  
  # Test 2: Homogeneity of Variances
  levene_test_result <- leveneTest(formula, data = data)
  levene_p_value <- levene_test_result$`Pr(>F)`[1]
  is_homogeneous <- levene_p_value > 0.05
  
  ## --- IMPROVEMENT ---
  # Replaced format.p() with pvalue() from the rstatix package for consistency.
  shapiro_p_formatted <- pvalue(shapiro_p_value, accuracy = .001, add_p = TRUE)
  levene_p_formatted <- pvalue(levene_p_value, accuracy = .001, add_p = TRUE)
  
  # --- 3. Print the Report to the Console ---
  
  cat("--- ANOVA Assumption Check ---\n\n")
  
  cat("1. Normality of Residuals (Shapiro-Wilk Test)\n")
  cat("   - p-value:", shapiro_p_formatted, "\n")
  if (is_normal) {
    cat("   - ✅ Assumption met (p > 0.05)\n\n")
  } else {
    cat("   - ❌ Assumption NOT met (p <= 0.05)\n\n")
  }
  
  cat("2. Homogeneity of Variances (Levene's Test)\n")
  cat("   - p-value:", levene_p_formatted, "\n")
  if (is_homogeneous) {
    cat("   - ✅ Assumption met (p > 0.05)\n\n")
  } else {
    cat("   - ❌ Assumption NOT met (p <= 0.05)\n\n")
  }
  
  cat("3. Independence of Observations\n")
  cat("   - ⚠️ This must be verified based on your study design.\n\n")
  
  # --- 4. Provide Final Recommendation ---
  
  cat("--- Recommendation ---\n")
  if (is_normal && is_homogeneous) {
    cat("✅ All testable assumptions are met.\n")
    cat("   If observations are independent, a PARAMETRIC test is appropriate.\n\n")
  } else {
    cat("❌ One or more assumptions were not met.\n")
    cat("   A NON-PARAMETRIC test is the recommended choice.\n\n")
  }
  
  cat("--- Visual Diagnostics ---\n")
  cat("Displaying diagnostic plots. Check the 'Plots' pane in RStudio.\n")
  par(mfrow = c(1, 2)) 
  plot(model, which = 1) # Residuals vs. Fitted
  plot(model, which = 2) # Normal Q-Q
  par(mfrow = c(1, 1)) 
  
  invisible(list(
    shapiro_wilk_test = shapiro_test_result,
    levene_test = levene_test_result,
    model = model
  ))
}