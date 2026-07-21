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


if __name__ == "__main__":
    unittest.main()
