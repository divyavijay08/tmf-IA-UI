"""Run a customer message through the existing governed runner, without a scenario.

Reuse its transport, timeout, session recording and budget export. Only its
scenario-context builder is replaced, in this isolated subprocess.
"""
import json
import sys
from pathlib import Path


def question_for(message, history):
    if not history:
        return message
    # Prior turns are conversation data, never instructions from the application.
    return ('Previous conversation (JSON):\n' + json.dumps(history, ensure_ascii=False)
            + '\n\nCurrent user message:\n' + message)


def main(argv=None):
    request_path, *runner_args = argv or sys.argv[1:]
    request = json.loads(Path(request_path).read_text())
    from tools.control7 import runner
    question = question_for(request['message'], request.get('history', []))
    original = runner.role_context
    try:
        runner.role_context = lambda role, scenario, cid, incident=None: {'question': question}
        return runner.main(runner_args)
    finally:
        runner.role_context = original


if __name__ == '__main__':
    sys.exit(main())
