import sys
import os
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from crawler import LibraryCrawler

class TestCrawlerGraphQL(unittest.TestCase):
    def setUp(self):
        self.crawler = LibraryCrawler()
        self.crawler.start_browser()

    def tearDown(self):
        self.crawler.close_browser()

    def test_search_physics(self):
        """測試七堂簡單物理課能被精確檢索出，不再誤判為查無書目。"""
        res = self.crawler.search_book("七堂簡單物理課")
        self.assertIsNotNone(res, "七堂簡單物理課 should be found")
        self.assertEqual(res["found_title"], "七堂簡單物理課")
        self.assertEqual(res["marc_id"], "2120452")

        # 驗證館藏
        holdings = self.crawler.get_book_holdings(res["marc_id"], target_branch="中壢分館")
        self.assertEqual(holdings["classification"], "OTHER_BRANCHES")
        self.assertIn("新總館", holdings["other_branches"])
        self.assertIn("平鎮分館", holdings["other_branches"])

    def test_search_atomic_habits(self):
        """測試原子習慣檢索。"""
        res = self.crawler.search_book("原子習慣")
        self.assertIsNotNone(res)
        self.assertIn("原子習慣", res["found_title"])

if __name__ == "__main__":
    unittest.main()
