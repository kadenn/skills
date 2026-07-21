import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("validate_repo", ROOT / "scripts" / "validate_repo.py")
assert SPEC and SPEC.loader
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


class RepositoryValidationTest(unittest.TestCase):
    def test_repository_contract(self):
        self.assertEqual(VALIDATOR.validate(), [])

    def test_skill_catalog_rejects_duplicate_and_missing_skills(self):
        payload = {
            "$schema": "https://skills.sh/schemas/skills.sh.schema.json",
            "notGrouped": "bottom",
            "groupings": [
                {
                    "title": "Example",
                    "description": "Example grouping.",
                    "skills": ["socratic", "socratic"],
                }
            ],
        }
        errors = VALIDATOR.validate_skill_catalog(payload)
        self.assertTrue(any("duplicate skills" in error for error in errors))
        self.assertTrue(any("expected" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
