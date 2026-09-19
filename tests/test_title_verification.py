import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from crawler import clean_title_candidates, is_title_match, normalize_title_for_match

class TestTitleVerification(unittest.TestCase):
    """驗證標點符號正規化與防抓錯（False Positive）標題比對機制。"""

    def test_punctuation_normalization(self):
        """測試標點符號正規化（轉空格與去除標點），不切碎語意。"""
        raw = "親愛的別怕，勇敢說YES"
        candidates = clean_title_candidates(raw)
        self.assertIn("親愛的別怕 勇敢說YES", candidates)
        self.assertIn("親愛的別怕勇敢說YES", candidates)
        # 確保不會產生危險的零碎片段（如單獨的「勇敢說YES」）
        self.assertNotIn("勇敢說YES", candidates)

    def test_title_match_true_positives(self):
        """測試正向相符比對（正確識別同一本書）。"""
        cases = [
            ("親愛的別怕，勇敢說YES", "親愛的別怕, 勇敢說yes : 關於生涯、職場、家庭、信仰的20則人生提醒 = Dear, don't be afraid, just say yes!"),
            ("原子習慣", "原子習慣 : 細微改變帶來巨大成就的實證法則"),
            ("商業思維-游舒帆", "商業思維 : 業務力、產品力、營運力的運作思維"),
            ("沒了名片, 你還剩下什麼? : 32個上班族增加自我籌碼的方法", "沒了名片, 你還剩下什麼? : 32個上班族增加自我籌碼的方法"),
            ("死亡不存在", "死亡不存在"),
            ("富爸爸窮爸爸(2018)", "富爸爸窮爸爸"),
        ]
        for raw, found in cases:
            self.assertTrue(is_title_match(raw, found), f"Expected match for raw='{raw}' and found='{found}'")

    def test_title_match_false_positives_prevented(self):
        """測試嚴格防止張冠李戴（杜絕不相干書籍誤判）。"""
        mismatches = [
            ("商業思維，從零開始", "從零開始學日語"),
            ("高效能人士的七個習慣，實踐篇", "初級英語會話：實踐篇"),
            ("彭建文三部曲", "思維的良率 : 台積電高階主管的思維訓練"),
            ("投資金律", "彼得林區 選股戰略"),
            ("原子習慣", "被討厭的勇氣"),
        ]
        for raw, found in mismatches:
            self.assertFalse(is_title_match(raw, found), f"Expected NO match for raw='{raw}' and found='{found}'")

if __name__ == "__main__":
    unittest.main(verbosity=2)
