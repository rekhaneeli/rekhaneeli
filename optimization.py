import pandas as pd
def optimize_budget(total_budget, df, features, model_results):
    coefs = model_results["coefficients"]
    
    # Calculate historical average period (e.g., monthly) spend per channel
    historical_avg_spend = {col: df[col].mean() for col in features}
    total_historical = sum(historical_avg_spend.values())
    
    # Heuristic: Allocate budget proportional to strictly positive coefficients
    positive_coefs = {k: v for k, v in coefs.items() if v > 0}
    total_coef_weight = sum(positive_coefs.values())
    
    recommendations = []
    expected_sales_increase_components = []
    
    for col in features:
        hist = historical_avg_spend.get(col, 0)
        
        if total_coef_weight > 0 and col in positive_coefs:
            rec_budget = total_budget * (positive_coefs[col] / total_coef_weight)
        else:
            rec_budget = 0
            
        diff = rec_budget - hist
        expected_sales_diff = diff * coefs.get(col, 0)
        
        recommendations.append({
            "Channel": col,
            "Historical Average Spend": hist,
            "Recommended Spend": rec_budget,
            "Budget Shift": diff
        })
        
        expected_sales_increase_components.append(expected_sales_diff)
        
    df_rec = pd.DataFrame(recommendations)
    expected_sales_increase = sum(expected_sales_increase_components)
    
    return df_rec, expected_sales_increase
