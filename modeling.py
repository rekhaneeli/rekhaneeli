import pandas as pd
import numpy as np
import statsmodels.api as sm
from statsmodels.stats.outliers_influence import variance_inflation_factor
from sklearn.metrics import mean_squared_error
def check_multicollinearity(df, features):
    X = df[features].copy()
    X = sm.add_constant(X)
    vif_data = pd.DataFrame()
    vif_data["Feature"] = X.columns
    vif_data["VIF"] = [variance_inflation_factor(X.values, i) for i in range(X.shape[1])]
    return vif_data[vif_data["Feature"] != 'const']
def train_linear_model(df, features, target='Sales'):
    X = df[features]
    X = sm.add_constant(X)
    y = df[target]
    
    model = sm.OLS(y, X).fit()
    
    predictions = model.predict(X)
    rmse = np.sqrt(mean_squared_error(y, predictions))
    
    results = {
        "model": model,
        "intercept": model.params.get('const', 0),
        "coefficients": model.params.drop('const', errors='ignore').to_dict(),
        "p_values": model.pvalues.drop('const', errors='ignore').to_dict(),
        "r_squared": model.rsquared,
        "rmse": rmse,
        "predictions": predictions
    }
    return results
def calculate_contributions(model_results, df, features):
    contributions = {}
    coefs = model_results["coefficients"]
    
    for col in features:
        contributions[col] = coefs.get(col, 0) * df[col].sum()
        
    contributions["Base/Intercept"] = model_results["intercept"] * len(df)
    
    df_contrib = pd.DataFrame(list(contributions.items()), columns=["Component", "Total_Contribution"])
    df_contrib["Share (%)"] = (df_contrib["Total_Contribution"] / df_contrib["Total_Contribution"].sum()) * 100
    
    return df_contrib
