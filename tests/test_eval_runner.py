import importlib.util
from pathlib import Path
import unittest
from unittest import mock


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

    def test_missing_must_match_is_a_non_blocking_diagnostic(self):
        case = {"must_match": [r"(?i)confidence"]}
        result = RUN_EVAL.check_output(case, "A useful answer without that exact word.", 0)
        self.assertTrue(result["passed"])
        self.assertFalse(result["diagnostics_passed"])
        self.assertFalse(result["checks"][1]["blocking"])

    def test_must_not_match_remains_blocking(self):
        case = {"must_not_match": [r"(?i)guaranteed"]}
        result = RUN_EVAL.check_output(case, "This is guaranteed.", 0)
        self.assertFalse(result["passed"])
        self.assertTrue(result["checks"][1]["blocking"])

    def test_extract_json_tolerates_markdown_prefix(self):
        payload = RUN_EVAL.extract_json('Result:\n```json\n{"selections": []}\n```')
        self.assertEqual(payload, {"selections": []})

    def test_single_judgment_requires_every_rubric_criterion(self):
        rubric = ["Uses repository evidence.", "Names a safe next action."]
        judgment = RUN_EVAL.parse_single_judgment(
            """{
              "criteria": [
                {"criterion": 1, "passed": true, "reason": "It cites the fixture.", "evidence": "config.py"},
                {"criterion": 2, "passed": false, "reason": "No next action.", "evidence": ""}
              ],
              "confidence": "high",
              "reason": "One criterion is missing."
            }""",
            rubric,
        )
        self.assertFalse(judgment["passed"])
        self.assertIsNone(judgment["parse_error"])

    def test_pair_prompt_limits_preference_to_material_rubric_differences(self):
        prompt = RUN_EVAL.pair_judge_prompt(
            {"prompt": "Do the task.", "rubric": ["Be correct."]},
            {"A": "Answer A", "B": "Answer B"},
        )
        self.assertIn("implicit but unambiguous evidence", prompt)
        self.assertIn("choose tie", prompt)
        self.assertIn("Do not break ties for style", prompt)
        self.assertIn("Never quote credential", prompt)

    def test_redact_payload_scrubs_nested_run_artifacts(self):
        payload = {
            "stdout": "safe",
            "stderr": "tool read fixture-sensitive-value-12345",
            "nested": ["fixture-sensitive-value-12345"],
        }
        sanitized = RUN_EVAL.redact_payload(
            payload,
            [r"fixture-sensitive-value-[0-9]+"],
        )
        self.assertEqual(sanitized["stderr"], "tool read [REDACTED]")
        self.assertEqual(sanitized["nested"], ["[REDACTED]"])
        self.assertNotIn("fixture-sensitive-value-12345", str(sanitized))

    def test_command_for_storage_omits_claude_prompt_argument(self):
        command = ["claude", "--print", "private candidate output"]
        self.assertEqual(
            RUN_EVAL.command_for_storage("claude", command),
            ["claude", "--print", "[PROMPT OMITTED]"],
        )
        self.assertEqual(
            RUN_EVAL.command_for_storage("codex", ["codex", "exec", "-"]),
            ["codex", "exec", "-"],
        )

    def test_run_for_storage_omits_stderr_after_redaction(self):
        run = {
            "command": ["codex"],
            "exit_code": 0,
            "stdout": "safe",
            "stderr": "trace fixture-sensitive-value-12345",
        }
        stored = RUN_EVAL.run_for_storage(
            run,
            [r"fixture-sensitive-value-[0-9]+"],
        )
        self.assertEqual(stored["stderr"], "[OMITTED]")
        self.assertTrue(stored["stderr_omitted"])
        self.assertNotIn("fixture-sensitive-value-12345", str(stored))

    def test_semantic_judge_retries_one_malformed_response(self):
        malformed = {
            "command": ["judge"],
            "exit_code": 0,
            "stdout": '{"arms":{"A":{"criteria":[]}}}',
            "stderr": "",
            "duration_seconds": 0.1,
        }
        valid = {
            "command": ["judge"],
            "exit_code": 0,
            "stdout": (
                '{"arms":{"A":{"criteria":[{"criterion":1,"passed":true,'
                '"reason":"ok","evidence":"a"}]},"B":{"criteria":[{"criterion":1,'
                '"passed":true,"reason":"ok","evidence":"b"}]}},"preference":"tie",'
                '"confidence":"high","reason":"equal"}'
            ),
            "stderr": "",
            "duration_seconds": 0.1,
        }
        case = {"prompt": "Do it.", "rubric": ["Be correct."]}
        candidates = {
            "with_skill": {"run": {"stdout": "A"}},
            "baseline": {"run": {"stdout": "B"}},
        }
        with mock.patch.object(RUN_EVAL, "run_agent", side_effect=[malformed, valid]) as run:
            result = RUN_EVAL.run_semantic_judge(
                "codex",
                None,
                case,
                candidates,
                30,
                ("with_skill", "baseline"),
                retries=1,
            )
        self.assertEqual(run.call_count, 2)
        self.assertEqual(len(result["attempts"]), 2)
        self.assertIsNone(result["judgment"]["parse_error"])

    def test_single_judgment_rejects_malformed_criterion_set(self):
        judgment = RUN_EVAL.parse_single_judgment(
            '{"criteria":[{"criterion":1,"passed":true,"reason":"ok","evidence":"x"}],'
            '"confidence":"high","reason":"ok"}',
            ["First", "Second"],
        )
        self.assertFalse(judgment["passed"])
        self.assertIn("criterion indexes", judgment["parse_error"])

    def test_pair_judgment_maps_blind_arms_back_to_variants(self):
        text = """{
          "arms": {
            "A": {"criteria": [{"criterion": 1, "passed": true, "reason": "complete", "evidence": "a"}]},
            "B": {"criteria": [{"criterion": 1, "passed": false, "reason": "missing", "evidence": ""}]}
          },
          "preference": "A",
          "confidence": "medium",
          "reason": "A better satisfies the rubric."
        }"""
        judgment = RUN_EVAL.parse_pair_judgment(
            text,
            ["Produce a complete answer."],
            {"A": "baseline", "B": "with_skill"},
        )
        self.assertTrue(judgment["variants"]["baseline"]["passed"])
        self.assertFalse(judgment["variants"]["with_skill"]["passed"])
        self.assertEqual(judgment["preferred_variant"], "baseline")

    def test_blind_arm_order_alternates_after_random_start(self):
        initial = ("baseline", "with_skill")
        self.assertEqual(RUN_EVAL.balanced_arm_order(initial, 1), initial)
        self.assertEqual(
            RUN_EVAL.balanced_arm_order(initial, 2),
            ("with_skill", "baseline"),
        )
        self.assertEqual(RUN_EVAL.balanced_arm_order(initial, 3), initial)

    def test_case_summary_reports_flakiness_and_pairwise_outcomes(self):
        trials = [
            self._trial(True, True, "with_skill"),
            self._trial(False, True, "baseline"),
            self._trial(True, True, "tie"),
        ]
        summary = RUN_EVAL.summarize_case_trials(trials, 2 / 3, baseline=True)
        self.assertTrue(summary["capability_passed"])
        self.assertTrue(summary["flaky"])
        self.assertEqual(summary["pass_rate"], 2 / 3)
        self.assertEqual(summary["comparison"]["skill_wins"], 1)
        self.assertEqual(summary["comparison"]["baseline_wins"], 1)
        self.assertTrue(summary["comparison"]["passed"])

    def test_unscored_judge_failure_is_not_capability_flakiness(self):
        trials = [
            self._trial(True, True, "with_skill"),
            self._trial(True, True, "tie"),
            self._trial(False, False, None),
        ]
        trials[2]["judge"]["judgment"]["parse_error"] = "malformed JSON"
        trials[2]["judge"]["attempts"] = [{}, {}]
        summary = RUN_EVAL.summarize_case_trials(trials, 2 / 3, baseline=True)
        self.assertFalse(summary["flaky"])
        self.assertEqual(summary["scored_runs"], 2)
        self.assertEqual(summary["judge_failures"], 1)
        self.assertEqual(summary["judge_retries_used"], 1)
        self.assertFalse(summary["valid"])

    @staticmethod
    def _trial(with_skill_passed, scored, preferred_variant):
        return {
            "candidates": {
                "with_skill": {
                    "run": {"exit_code": 0},
                    "deterministic": {"passed": True},
                    "semantic": {"passed": with_skill_passed, "scored": scored},
                }
            },
            "judge": {
                "run": {"exit_code": 0},
                "judgment": {"parse_error": None, "preferred_variant": preferred_variant},
            },
        }

    def test_every_skill_has_cases(self):
        for skill in RUN_EVAL.SKILL_NAMES:
            with self.subTest(skill=skill):
                self.assertGreaterEqual(len(RUN_EVAL.load_behavior_cases(skill)), 3)


if __name__ == "__main__":
    unittest.main()
