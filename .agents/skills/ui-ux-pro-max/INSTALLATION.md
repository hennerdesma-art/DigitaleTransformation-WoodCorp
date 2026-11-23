# UI/UX Pro Max – Woodcorp installation

Upstream: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
Original author: Next Level Builder. MIT license included in `LICENSE`.

This is a repository-local installation of the complete runtime skill (SKILL.md, design datasets, references and Python scripts), excluding upstream developer-only tests and the maintenance script `validate_data.py`. The script path in `SKILL.md` was adapted for `.agents/skills`.

## Run from the repository root

```bash
python .agents/skills/ui-ux-pro-max/scripts/search.py "analytics dashboard charts" --domain chart
python .agents/skills/ui-ux-pro-max/scripts/search.py "enterprise analytics dashboard" --design-system -p "Woodcorp Process Intelligence"
```

The skill provides general design advice, not the final NXT brand rules. A separate NXT/Woodcorp design skill can be added next.

Repository installation does not add the skill automatically to an individual's ChatGPT Skill library. Team members should use a compatible coding agent or separately import the skill.
