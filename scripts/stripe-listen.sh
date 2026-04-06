#!/bin/sh
if command -v stripe >/dev/null 2>&1; then
  stripe listen --forward-to localhost:3000/api/webhooks/stripe
else
  echo "Stripe CLI not installed — skipping webhook forwarding."
  echo "Install it with: brew install stripe/stripe-cli/stripe"
  # Keep the process alive so concurrently doesn't restart it
  tail -f /dev/null
fi
