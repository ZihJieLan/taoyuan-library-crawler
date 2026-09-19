import sys
import os
import unittest

# 將專案根目錄加入模組搜尋路徑
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from crawler import clean_title_candidates

class TestRegression0919B(unittest.TestCase):
    """0919B 全量回歸測試套件。"""

    def test_page_number_cleaning(self):
        """測試 1：使用者尾隨標註頁碼之自動過濾。"""
        cases = [
            ("精準回饋 88", "精準回饋"),
            ("原子習慣 p.120", "原子習慣"),
            ("原子習慣 P120", "原子習慣"),
            ("被討厭的勇氣-150", "被討厭的勇氣"),
            ("被討厭的勇氣——150", "被討厭的勇氣"),
            ("投資金律 50頁", "投資金律"),
            ("滾動內容複利 12", "滾動內容複利"),
            ("致富的特權 p.99", "致富的特權"),
            ("無瑕的程式碼-200", "無瑕的程式碼"),
        ]
        for raw, expected in cases:
            candidates = clean_title_candidates(raw)
            self.assertEqual(candidates[0], expected, f"Failed for raw='{raw}', got candidates: {candidates}")

    def test_year_bracket_cleaning(self):
        """測試 2：年份括號之自動過濾。"""
        cases = [
            ("一個投機者的告白(2018)", "一個投機者的告白"),
            ("一個投機者的告白之證券心理學(2018)", "一個投機者的告白之證券心理學"),
            ("富爸爸窮爸爸【2020年版】", "富爸爸窮爸爸"),
        ]
        for raw, expected in cases:
            candidates = clean_title_candidates(raw)
            self.assertIn(expected, candidates, f"Expected '{expected}' in candidates of '{raw}', got {candidates}")

    def test_subtitle_and_symbol_handling(self):
        """測試 3：冒號、副標題與作者切割之備選詞產生。"""
        cases = [
            ("沒了名片, 你還剩下什麼? : 32個上班族增加自我籌碼的方法", "沒了名片, 你還剩下什麼"),
            ("商業思維-游舒帆", "商業思維"),
            ("悉達多：一首印度的詩》（流浪者之歌）", "悉達多"),
            ("影響力：讓人乖乖聽話的說服術", "影響力"),
        ]
        for raw, expected in cases:
            candidates = clean_title_candidates(raw)
            self.assertIn(expected, candidates, f"Expected '{expected}' in candidates of '{raw}', got {candidates}")

    def test_branch_clean_matching(self):
        """測試 4：分館名稱比對精確性。"""
        branches = [
            "中壢分館", "新總館", "青埔智慧科技分館", "龍岡分館", 
            "平鎮分館", "八德分館", "大園分館", "大溪分館"
        ]
        for b in branches:
            clean = b.replace("分館", "").strip()
            self.assertTrue(len(clean) >= 2, f"Clean branch name should be at least 2 chars: {clean}")

if __name__ == "__main__":
    unittest.main(verbosity=2)
