<!-- These are the steps in order to run Nova  -->

# Before running the commands below, make sure AWS CLI is installed.
# Run this command:
brew install awscli

# To confirm it worked, run:
aws --version

# Next, sign in to the AWS console, make sure you are in the us-east-1 region,
# Return to the terminal and authenticate with AWS, type in the region when prompted
# Make sure you are in the correct folder to run the commands below.

1. Open the AWS console and sign in.
2. Make sure your active region is us-east-1.
3. Run: aws login
4. When prompted, select the active session.
5. Return to the terminal and run:
   cd scenario-live/nova
   ./aws-credentials.sh

# If you have issues authenticating, it may be related to your AWS permissions.
# Reminder: the credentials only work for about an hour until they expire.

