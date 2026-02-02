#!/bin/bash
# Setup video sync dependencies on VM
# Run once on the VM to enable video transcription

set -e

echo "Setting up video sync dependencies..."

# Install system packages
sudo apt-get update
sudo apt-get install -y ffmpeg

# Install yt-dlp (latest version)
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# Install Python packages in the backend venv
cd /home/azureuser/Chess
source backend/venv/bin/activate
pip install faster-whisper google-genai python-dotenv

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Create /home/azureuser/Chess/scripts/.env.sync with:"
echo "   API_BASE_URL=https://lumna.co"
echo "   SYNC_API_KEY=lumna-sync-2024"
echo "   GEMINI_API_KEY=your-key-here"
echo ""
echo "2. Test with: python scripts/sync_video_summaries.py"
echo ""
echo "3. Add cron job for daily sync:"
echo "   crontab -e"
echo "   0 6 * * * cd /home/azureuser/Chess && source backend/venv/bin/activate && python scripts/sync_video_summaries.py >> /home/azureuser/video-sync.log 2>&1"
