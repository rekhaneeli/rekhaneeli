import pandas as pd
from io import BytesIO
def create_excel_report(model_metrics, df_contrib, df_optim):
    output = BytesIO()
    
    metrics_df = pd.DataFrame([model_metrics])
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        metrics_df.to_excel(writer, sheet_name='Model Results', index=False)
        df_contrib.to_excel(writer, sheet_name='Channel Contributions', index=False)
        df_optim.to_excel(writer, sheet_name='Budget Recommendations', index=False)
        
    processed_data = output.getvalue()
    return processed_data
