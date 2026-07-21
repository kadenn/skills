import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("run_eval", ROOT / "evals" / "run_eval.py")
assert SPEC and SPEC.loader
RUN_EVAL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUN_EVAL)


class EvalRunnerTest(unittest.TestCase):
    def test_check_output_accepts_expected_response(self):
        case = {
            "must_match": [r"(?i)active work", r"(?i)confidence"],
            "must_not_match": [r"(?i)guaranteed"],
            "max_questions": 0,
            "max_words": 20,
        }
        result = RUN_EVAL.check_output(case, "Active work: 3h. Confidence: medium.", 0)
        self.assertTrue(result["passed"])

    def test_check_output_reports_each_failure(self):
        case = {
            "must_match": [r"(?i)confidence"],
            "must_not_match": [r"(?i)guaranteed"],
            "max_questions": 0,
        }
        result = RUN_EVAL.check_output(case, "Guaranteed. Any questions?", 1)
        self.assertFalse(result["passed"])
        self.assertEqual(sum(not check["passed"] for check in result["checks"]), 4)

    def test_extract_json_tolerates_markdown_prefix(self):
        payload = RUN_EVAL.extract_json('Result:\n```json\n{"selections": []}\n```')
        self.assertEqual(payload, {"selections": []})

    def test_every_skill_has_cases(self):
        for skill in RUN_EVAL.SKILL_NAMES:
            with self.subTest(skill=skill):
                self.assertGreaterEqual(len(RUN_EVAL.load_behavior_cases(skill)), 3)


if __name__ == "__main__":
    unittest.main()
