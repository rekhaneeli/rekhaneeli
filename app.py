import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from utils.data_prep import validate_data, prepare_data, apply_lag_analysis, apply_adstock
from utils.modeling import check_multicollinearity, train_linear_model, calculate_contributions
from utils.optimization import optimize_budget
from utils.export_utils import create_excel_report

st.set_page_config(page_title="MMM Lite", layout="wide")

st.title("📈 MMM Lite: Marketing Mix Modeling & Budget Optimizer")
st.markdown("Upload your monthly marketing spend and sales data to evaluate performance and optimize your budget.")

# --- 1. DATA UPLOAD ---
st.header("1. Upload Data")
uploaded_file = st.file_uploader("Upload CSV or Excel file", type=["csv", "xlsx"])

if uploaded_file:
    if uploaded_file.name.endswith('.csv'):
        df_raw = pd.read_csv(uploaded_file)
    else:
        df_raw = pd.read_excel(uploaded_file)
        
    st.write(f"**Data Preview ({df_raw.shape[0]} rows, {df_raw.shape[1]} columns):**")
    st.dataframe(df_raw.head())

    # --- 2. DATA VALIDATION ---
    st.header("2. Data Validation")
    val_summary = validate_data(df_raw)
    
    col1, col2, col3 = st.columns(3)
    col1.metric("Missing Values", sum(val_summary["missing_values"].values()))
    col2.metric("Duplicate Records", val_summary["duplicate_records"])
    col3.metric("Negative Spends", sum(val_summary["negative_spends"].values()))

    # --- 3. DATA PREPARATION ---
    df_clean, spend_cols = prepare_data(df_raw)
    st.success("Data automatically cleaned: Dates sorted, missing spends filled with 0, duplicates removed.")

    # --- 4 & 5. LAG AND ADSTOCK ---
    st.header("3. Feature Transformation")
    
    # Lag Analysis
    df_lagged, preferred_lags = apply_lag_analysis(df_clean, spend_cols, target='Sales')
    st.write("**Optimal Lags Found (Max Correlation with Sales):**")
    st.json(preferred_lags)
    
    # Adstock
    theta = st.selectbox("Select Adstock Decay Rate (θ):", options=[0.3, 0.5, 0.7], index=1)
    df_transformed = apply_adstock(df_lagged, spend_cols, theta=theta)
    
    with st.expander("View Transformed Data"):
        st.dataframe(df_transformed.head())

    # --- 6. MULTICOLLINEARITY ---
    st.header("4. Multicollinearity Check")
    vif_df = check_multicollinearity(df_transformed, spend_cols)
    st.dataframe(vif_df)
    
    if (vif_df["VIF"] > 5).any():
        st.warning("⚠️ Warning: High Multicollinearity detected (VIF > 5). Model coefficients may be volatile.")

    # --- 7. LINEAR REGRESSION ---
    st.header("5. Linear Regression Model")
    model_results = train_linear_model(df_transformed, spend_cols, target='Sales')
    
    col1, col2 = st.columns(2)
    col1.metric("R-Squared", f"{model_results['r_squared']:.4f}")
    col2.metric("RMSE", f"{model_results['rmse']:,.2f}")
    
    st.write("**Model Coefficients & P-Values**")
    coef_df = pd.DataFrame({
        "Predictor": list(model_results["coefficients"].keys()),
        "Coefficient": list(model_results["coefficients"].values()),
        "P-Value": list(model_results["p_values"].values())
    })
    st.dataframe(coef_df)

    # --- 8. VISUALIZATIONS ---
    st.header("6. Model Visualizations")
    
    # Actual vs Predicted
    fig_line = go.Figure()
    fig_line.add_trace(go.Scatter(x=df_transformed['Month'], y=df_transformed['Sales'], mode='lines+markers', name='Actual Sales'))
    fig_line.add_trace(go.Scatter(x=df_transformed['Month'], y=model_results['predictions'], mode='lines+markers', name='Predicted Sales'))
    fig_line.update_layout(title="Actual vs Predicted Sales", xaxis_title="Month", yaxis_title="Sales")
    st.plotly_chart(fig_line, use_container_width=True)
    
    col_viz1, col_viz2 = st.columns(2)
    
    # Channel Contributions
    df_contrib = calculate_contributions(model_results, df_transformed, spend_cols)
    fig_pie = px.pie(df_contrib, values='Total_Contribution', names='Component', title="Channel Contributions to Sales")
    col_viz1.plotly_chart(fig_pie, use_container_width=True)
    
    # Correlation Heatmap
    corr_matrix = df_transformed[spend_cols + ['Sales']].corr()
    fig_heat = px.imshow(corr_matrix, text_auto=".2f", aspect="auto", color_continuous_scale="Blues", title="Correlation Heatmap")
    col_viz2.plotly_chart(fig_heat, use_container_width=True)

    # --- 9. BUDGET OPTIMIZATION ---
    st.header("7. Simple Budget Optimization")
    st.write("Allocate a new total budget to maximize expected sales based on your modeled coefficients.")
    
    total_budget_input = st.number_input("Enter Total Budget for next period:", min_value=0, value=20000, step=1000)
    
    df_optim, exp_sales_inc = optimize_budget(total_budget_input, df_transformed, spend_cols, model_results)
    
    st.dataframe(df_optim.style.format({
        "Historical Average Spend": "{:,.2f}",
        "Recommended Spend": "{:,.2f}",
        "Budget Shift": "{:+,.2f}"
    }))
    
    st.metric("Expected Sales Increase vs Historical Average", f"{exp_sales_inc:+,.2f}")

    # --- 10. EXPORT REPORT ---
    st.header("8. Export Results")
    metrics_export = {
        "R-Squared": model_results["r_squared"],
        "RMSE": model_results["rmse"],
        "Intercept": model_results["intercept"]
    }
    metrics_export.update(model_results["coefficients"])
    
    excel_file = create_excel_report(metrics_export, df_contrib, df_optim)
    
    st.download_button(
        label="📥 Download Excel Report",
        data=excel_file,
        file_name="MMM_Lite_Report.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
