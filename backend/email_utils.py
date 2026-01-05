import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

# Gmail SMTP configuration
SMTP_SERVER = 'smtp.gmail.com'
SMTP_PORT = 587
SMTP_EMAIL = os.environ.get('SMTP_EMAIL')  # Your Gmail address
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD')  # Gmail App Password


def send_earnings_alert_email(to_email: str, to_name: str, earnings_data: list, alert_type: str, schedule_info: dict = None) -> bool:
    """
    Send an earnings alert email with a table of upcoming earnings.

    Args:
        to_email: Recipient's email address
        to_name: Recipient's name
        earnings_data: List of dicts with keys: ticker, company_name, next_earnings_date, remaining_days, date_confirmed
        alert_type: 'weekly', 'days_before', or 'test'
        schedule_info: Optional dict with keys: weekly_enabled, days_before_enabled, days_before

    Returns:
        True if email sent successfully, False otherwise
    """
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        print("SMTP credentials not configured")
        return False

    if not earnings_data:
        print("No earnings data to send")
        return False

    # Build email subject
    if alert_type == 'weekly':
        subject = "Weekly Earnings Calendar Summary"
    elif alert_type == 'test':
        subject = "Your Earnings Alert Preview"
    else:
        subject = "Upcoming Earnings Alert"

    # Build schedule explanation for test emails
    schedule_text = None
    if alert_type == 'test' and schedule_info:
        schedules = []
        if schedule_info.get('weekly_enabled'):
            schedules.append("every Monday at 9 AM")
        if schedule_info.get('days_before_enabled'):
            days = schedule_info.get('days_before', 7)
            schedules.append(f"{days} days before each earnings release")
        if schedules:
            schedule_text = " and ".join(schedules)

    # Build HTML email body
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background-color: #f8fafc;
                padding: 20px;
            }}
            .container {{
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 12px;
                padding: 30px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }}
            h1 {{
                color: #1e293b;
                font-size: 24px;
                margin-bottom: 10px;
            }}
            .subtitle {{
                color: #64748b;
                font-size: 14px;
                margin-bottom: 25px;
            }}
            table {{
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
            }}
            th {{
                background-color: #f1f5f9;
                color: #475569;
                text-align: left;
                padding: 12px 10px;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
                border-bottom: 2px solid #e2e8f0;
            }}
            td {{
                padding: 14px 10px;
                border-bottom: 1px solid #e2e8f0;
                color: #334155;
                font-size: 14px;
            }}
            tr:hover {{
                background-color: #f8fafc;
            }}
            .ticker {{
                font-weight: 700;
                color: #0f172a;
            }}
            .company {{
                color: #64748b;
                font-size: 13px;
            }}
            .days {{
                display: inline-block;
                padding: 4px 10px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 500;
            }}
            .days-urgent {{
                background-color: #fef2f2;
                color: #dc2626;
            }}
            .days-soon {{
                background-color: #fefce8;
                color: #ca8a04;
            }}
            .days-normal {{
                background-color: #f0fdf4;
                color: #16a34a;
            }}
            .confirmed {{
                color: #16a34a;
            }}
            .estimated {{
                color: #94a3b8;
            }}
            .source {{
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 4px 10px;
                border-radius: 20px;
                font-size: 11px;
                font-weight: 600;
            }}
            .source-portfolio {{
                background-color: #dcfce7;
                color: #16a34a;
            }}
            .source-watchlist {{
                background-color: #dbeafe;
                color: #2563eb;
            }}
            .source svg {{
                width: 14px;
                height: 14px;
            }}
            .footer {{
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e2e8f0;
                text-align: center;
                color: #94a3b8;
                font-size: 12px;
            }}
            .footer a {{
                color: #3b82f6;
                text-decoration: none;
            }}
            .preview-banner {{
                background-color: #eff6ff;
                border: 1px solid #bfdbfe;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 20px;
                text-align: center;
            }}
            .preview-banner-title {{
                color: #1d4ed8;
                font-weight: 600;
                font-size: 14px;
                margin-bottom: 4px;
            }}
            .preview-banner-text {{
                color: #3b82f6;
                font-size: 13px;
            }}
        </style>
    </head>
    <body>
        <div class="container">
    """

    # Add preview banner for test emails
    if schedule_text:
        html_body += f"""
            <div class="preview-banner">
                <p class="preview-banner-title">This is a preview of your earnings alerts</p>
                <p class="preview-banner-text">You will receive this email {schedule_text}</p>
            </div>
        """

    html_body += f"""
            <h1>Upcoming Earnings</h1>
            <p class="subtitle">Hi {to_name}, here are your upcoming earnings releases:</p>

            <table>
                <thead>
                    <tr>
                        <th>Ticker</th>
                        <th>Company</th>
                        <th>Source</th>
                        <th>Earnings Date</th>
                        <th>Days Left</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
    """

    for item in earnings_data:
        ticker = item.get('ticker', '')
        company_name = item.get('company_name', ticker)
        earnings_date = item.get('next_earnings_date', 'N/A')
        remaining_days = item.get('remaining_days')
        date_confirmed = item.get('date_confirmed', False)
        source = item.get('source', 'none')

        # Format the date nicely
        if earnings_date and earnings_date != 'N/A':
            try:
                date_obj = datetime.strptime(earnings_date, '%Y-%m-%d')
                formatted_date = date_obj.strftime('%b %d, %Y')
            except ValueError:
                formatted_date = earnings_date
        else:
            formatted_date = 'N/A'

        # Days styling
        if remaining_days is not None:
            if remaining_days <= 3:
                days_class = 'days-urgent'
            elif remaining_days <= 7:
                days_class = 'days-soon'
            else:
                days_class = 'days-normal'
            days_text = f'{remaining_days} days'
        else:
            days_class = 'days-normal'
            days_text = '-'

        # Confirmed status
        status_class = 'confirmed' if date_confirmed else 'estimated'
        status_text = 'Confirmed' if date_confirmed else 'Estimated'

        # Source styling with inline SVG icons (Lucide icons)
        if source == 'portfolio':
            source_class = 'source-portfolio'
            # Briefcase icon (Lucide)
            source_icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>'
            source_text = 'Portfolio'
        elif source == 'watchlist':
            source_class = 'source-watchlist'
            # Eye icon (Lucide)
            source_icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
            source_text = 'Watchlist'
        else:
            source_class = ''
            source_icon = ''
            source_text = '-'

        source_html = f'{source_icon}{source_text}' if source_icon else source_text

        html_body += f"""
                    <tr>
                        <td><span class="ticker">{ticker}</span></td>
                        <td><span class="company">{company_name}</span></td>
                        <td><span class="source {source_class}">{source_html}</span></td>
                        <td>{formatted_date}</td>
                        <td><span class="days {days_class}">{days_text}</span></td>
                        <td><span class="{status_class}">{status_text}</span></td>
                    </tr>
        """

    html_body += """
                </tbody>
            </table>

            <div class="footer">
                <p>You received this email because you subscribed to earnings alerts on
                <a href="https://improveatchess.io">improveatchess.io</a></p>
                <p>To manage your alert preferences, visit the Earnings Calendar page.</p>
            </div>
        </div>
    </body>
    </html>
    """

    # Create message
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = f"Improve At Chess <{SMTP_EMAIL}>"
    msg['To'] = to_email

    # Plain text fallback
    plain_text = f"Hi {to_name},\n\nHere are your upcoming earnings releases:\n\n"
    for item in earnings_data:
        ticker = item.get('ticker', '')
        company_name = item.get('company_name', ticker)
        earnings_date = item.get('next_earnings_date', 'N/A')
        remaining_days = item.get('remaining_days', '-')
        status = 'Confirmed' if item.get('date_confirmed') else 'Estimated'
        source = item.get('source', 'none')
        source_text = '[Portfolio]' if source == 'portfolio' else '[Watchlist]' if source == 'watchlist' else ''
        plain_text += f"- {ticker} ({company_name}) {source_text}: {earnings_date} ({remaining_days} days) - {status}\n"
    plain_text += "\n\nVisit https://improveatchess.io to manage your alerts."

    msg.attach(MIMEText(plain_text, 'plain'))
    msg.attach(MIMEText(html_body, 'html'))

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.send_message(msg)
        print(f"Email sent successfully to {to_email}")
        return True
    except Exception as e:
        print(f"Failed to send email to {to_email}: {e}")
        return False
