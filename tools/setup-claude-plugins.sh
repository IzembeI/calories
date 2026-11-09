#!/usr/bin/env bash
# Installs every Claude Code plugin used in this project on a new machine or account.
# Run in Git Bash (Windows), Terminal (macOS) or any bash:  bash tools/setup-claude-plugins.sh
# Third-party marketplaces are GitHub repos; review them before installing if you are unsure.

marketplaces=(
  anthropics/skills
  anthropics/knowledge-work-plugins
  anthropics/claude-plugins-official
  nextlevelbuilder/ui-ux-pro-max-skill
  mvanhorn/last30days-skill
  coreyhaines31/marketingskills
  blader/humanizer
  Jakeschincariol/replica-skill
  JuliusBrussee/caveman
)

plugins=(
  # Anthropic directory (built in)
  claude-code-setup@anthropic-plugin-directory
  context7@anthropic-plugin-directory
  expo@anthropic-plugin-directory
  firecrawl@anthropic-plugin-directory
  github@anthropic-plugin-directory
  mobile-app-design-ios@anthropic-plugin-directory
  notion@anthropic-plugin-directory
  react-native-best-practices@anthropic-plugin-directory
  security-guidance@anthropic-plugin-directory
  supabase@anthropic-plugin-directory
  superpowers@anthropic-plugin-directory
  telegram@anthropic-plugin-directory
  # GitHub marketplaces
  document-skills@anthropic-agent-skills
  example-skills@anthropic-agent-skills
  marketing@knowledge-work-plugins
  ui-ux-pro-max@ui-ux-pro-max-skill
  last30days@last30days-skill
  marketing-skills@marketingskills
  humanizer@humanizer
  replica-skill@replica-skill
  caveman@caveman
)

for m in "${marketplaces[@]}"; do
  echo "== marketplace $m"
  claude plugin marketplace add "$m" || echo "   (skipped: already added or failed)"
done

failed=()
for p in "${plugins[@]}"; do
  echo "== plugin $p"
  claude plugin install "$p" || failed+=("$p")
done

echo
if [ ${#failed[@]} -eq 0 ]; then
  echo "All ${#plugins[@]} plugins installed. Start a new Claude session to load them."
else
  echo "Failed: ${failed[*]}"
fi
echo "Then sign in where needed: run /mcp in an interactive 'claude' for context7, github, notion, supabase, telegram, firecrawl."
