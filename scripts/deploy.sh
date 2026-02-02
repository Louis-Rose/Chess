#!/bin/bash
# Deploy latest changes to production

set -e

echo "Deploying to production..."
ssh azureuser@20.86.130.108 "cd /home/azureuser/Chess && git pull && ./scripts/start.sh --prod restart"
echo "Done!"
