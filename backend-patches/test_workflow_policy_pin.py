"""Run with the backend checkout path after applying workflow-policy-pin.patch."""
import sys
import unittest
from datetime import datetime
from unittest.mock import patch
sys.path.insert(0,sys.argv.pop(1))
from tools.ticketing import hooks

class PolicyPin(unittest.TestCase):
    def test_snapshot_is_pinned_before_workflow_and_register_edits_do_not_change_it(self):
        entry={'version':'v1','observation_limit':'60000','owner':'Owner','version_date':'2026-10-04'}
        with patch('tools.control16.watch.register_entry',return_value=entry) as read,patch.object(hooks,'now',return_value='2026-10-06T12:00:00Z'):
            watcher=hooks.WorkflowWatch('/tmp/unused-policy-test','unused')
            entry['version']='changed'
            self.assertEqual(watcher.entry['version'],'v1')
            self.assertLess(datetime.fromisoformat(watcher.policy_pinned_at.replace('Z','+00:00')),datetime.fromisoformat('2026-10-06T12:00:00.001+00:00'))
            self.assertIsNone(watcher.live)
            read.assert_called_once_with('unused')

unittest.main()
