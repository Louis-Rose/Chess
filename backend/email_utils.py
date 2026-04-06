import os
import smtplib
import base64
import re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from datetime import datetime

# Gmail SMTP configuration
SMTP_SERVER = 'smtp.gmail.com'
SMTP_PORT = 587
SMTP_EMAIL = os.environ.get('SMTP_EMAIL')  # Your Gmail address
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD')  # Gmail App Password
FEEDBACK_EMAIL = 'rose.louis.mail@gmail.com'  # Where to send feedback


def send_feedback_email(from_name: str, from_email: str, message: str, images: list = None) -> bool:
    """
    Send user feedback email with optional screenshot attachments.

    Args:
        from_name: User's name
        from_email: User's email
        message: Feedback message
        images: List of base64 data URIs (e.g., "data:image/png;base64,...")

    Returns:
        True if email sent successfully, False otherwise
    """
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        print("SMTP credentials not configured")
        return False

    if images is None:
        images = []

    subject = f"[LUMNA Feedback] from {from_name}"

    # Build images HTML section
    images_html = ""
    if images:
        images_html = """
            <div class="screenshots">
                <h2>Screenshots</h2>
                <div class="images">
        """
        for i, _ in enumerate(images):
            images_html += f'<img src="cid:screenshot{i}" alt="Screenshot {i+1}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 10px 0; border: 1px solid #e2e8f0;" />'
        images_html += """
                </div>
            </div>
        """

    # Escape HTML in message
    escaped_message = message.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;') if message else "(No message)"

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
                max-width: 800px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 12px;
                padding: 30px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }}
            h1 {{
                color: #1e293b;
                font-size: 24px;
                margin-bottom: 20px;
            }}
            h2 {{
                color: #1e293b;
                font-size: 18px;
                margin-top: 25px;
                margin-bottom: 15px;
            }}
            .info {{
                background-color: #f1f5f9;
                border-radius: 8px;
                padding: 15px;
                margin-bottom: 20px;
            }}
            .info p {{
                margin: 5px 0;
                color: #475569;
                font-size: 14px;
            }}
            .info strong {{
                color: #1e293b;
            }}
            .message {{
                background-color: #fefce8;
                border-left: 4px solid #eab308;
                padding: 15px;
                border-radius: 0 8px 8px 0;
            }}
            .message p {{
                margin: 0;
                color: #1e293b;
                white-space: pre-wrap;
                line-height: 1.6;
            }}
            .screenshots {{
                margin-top: 25px;
                padding-top: 20px;
                border-top: 1px solid #e2e8f0;
            }}
            .images {{
                display: block;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>New Feedback Received</h1>
            <div class="info">
                <p><strong>From:</strong> {from_name}</p>
                <p><strong>Email:</strong> {from_email}</p>
                <p><strong>Date:</strong> {datetime.now().strftime('%B %d, %Y at %H:%M')}</p>
                <p><strong>Screenshots:</strong> {len(images)}</p>
            </div>
            <div class="message">
                <p>{escaped_message}</p>
            </div>
            {images_html}
        </div>
    </body>
    </html>
    """

    # Create multipart message with related subtype for inline images
    msg = MIMEMultipart('related')
    msg['Subject'] = subject
    msg['From'] = f"LUMNA Feedback <{SMTP_EMAIL}>"
    msg['To'] = FEEDBACK_EMAIL
    msg['Reply-To'] = from_email

    # Create alternative part for text/html
    msg_alternative = MIMEMultipart('alternative')
    msg.attach(msg_alternative)

    plain_text = f"Feedback from {from_name} ({from_email}):\n\n{message or '(No message)'}\n\n[{len(images)} screenshot(s) attached]"
    msg_alternative.attach(MIMEText(plain_text, 'plain'))
    msg_alternative.attach(MIMEText(html_body, 'html'))

    # Attach images as inline
    for i, data_uri in enumerate(images):
        try:
            # Parse data URI: data:image/png;base64,ABC123...
            match = re.match(r'data:image/(\w+);base64,(.+)', data_uri)
            if match:
                img_type = match.group(1)
                img_data = base64.b64decode(match.group(2))

                img = MIMEImage(img_data, _subtype=img_type)
                img.add_header('Content-ID', f'<screenshot{i}>')
                img.add_header('Content-Disposition', 'inline', filename=f'screenshot{i+1}.{img_type}')
                msg.attach(img)
        except Exception as e:
            print(f"Failed to attach image {i}: {e}")

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.send_message(msg)
        print(f"Feedback email sent successfully from {from_email} with {len(images)} images")
        return True
    except Exception as e:
        print(f"Failed to send feedback email: {e}")
        return False


def send_admin_deletion_alert(user_name: str, user_email: str, deletion_type: str, details: dict = None) -> bool:
    """
    Send an admin alert when a user deletes data.

    Args:
        user_name: Name of the user who performed the deletion
        user_email: Email of the user
        deletion_type: Type of deletion ('transaction', 'account', 'user_account', 'bulk_replace')
        details: Additional details about what was deleted

    Returns:
        True if email sent successfully, False otherwise
    """
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        print("SMTP credentials not configured")
        return False

    if details is None:
        details = {}

    # Build subject based on deletion type
    type_labels = {
        'transaction': 'Transaction Deleted',
        'account': 'Investment Account Deleted',
        'user_account': 'User Account Deleted',
        'bulk_replace': 'Portfolio Replaced (Bulk Import)',
    }
    subject = f"[LUMNA Admin] {type_labels.get(deletion_type, 'Data Deleted')} - {user_name}"

    # Build details HTML
    details_html = ""
    if details:
        details_html = "<ul style='margin: 0; padding-left: 20px;'>"
        for key, value in details.items():
            details_html += f"<li><strong>{key}:</strong> {value}</li>"
        details_html += "</ul>"

    # Severity color based on deletion type
    severity_colors = {
        'transaction': '#f59e0b',  # amber
        'account': '#f97316',       # orange
        'user_account': '#ef4444',  # red
        'bulk_replace': '#8b5cf6',  # purple
    }
    severity_color = severity_colors.get(deletion_type, '#6b7280')

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
                max-width: 500px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 12px;
                padding: 30px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                border-top: 4px solid {severity_color};
            }}
            h1 {{
                color: #1e293b;
                font-size: 20px;
                margin-bottom: 20px;
            }}
            .badge {{
                display: inline-block;
                background-color: {severity_color};
                color: white;
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
                margin-bottom: 20px;
            }}
            .info {{
                background-color: #f1f5f9;
                border-radius: 8px;
                padding: 15px;
                margin-bottom: 15px;
            }}
            .info p {{
                margin: 8px 0;
                color: #475569;
                font-size: 14px;
            }}
            .info strong {{
                color: #1e293b;
            }}
            .details {{
                background-color: #fefce8;
                border-left: 4px solid {severity_color};
                padding: 15px;
                border-radius: 0 8px 8px 0;
                font-size: 14px;
                color: #1e293b;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <span class="badge">{type_labels.get(deletion_type, 'Deletion')}</span>
            <h1>User Data Deletion Alert</h1>
            <div class="info">
                <p><strong>User:</strong> {user_name}</p>
                <p><strong>Email:</strong> {user_email}</p>
                <p><strong>Time:</strong> {datetime.now().strftime('%B %d, %Y at %H:%M UTC')}</p>
            </div>
            {f'<div class="details">{details_html}</div>' if details_html else ''}
        </div>
    </body>
    </html>
    """

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = f"LUMNA Admin <{SMTP_EMAIL}>"
    msg['To'] = FEEDBACK_EMAIL

    # Plain text fallback
    plain_text = f"""User Data Deletion Alert

Type: {type_labels.get(deletion_type, 'Deletion')}
User: {user_name}
Email: {user_email}
Time: {datetime.now().strftime('%B %d, %Y at %H:%M UTC')}
"""
    if details:
        plain_text += "\nDetails:\n"
        for key, value in details.items():
            plain_text += f"  - {key}: {value}\n"

    msg.attach(MIMEText(plain_text, 'plain'))
    msg.attach(MIMEText(html_body, 'html'))

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.send_message(msg)
        print(f"Admin deletion alert sent for {user_email} ({deletion_type})")
        return True
    except Exception as e:
        print(f"Failed to send admin deletion alert: {e}")
        return False


