/**
 * @file clock.js
 * @description 時間與星辰之書 - 處理所有與時間顯示相關的魔法
 */

import { ui } from './ui.js';

// 來自古老東方魔法書的農曆計算咒語
const lunarData = {
    lunarInfo: [
        0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
        0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
        0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
        0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
        0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
        0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0,
        0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
        0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6,
        0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
        0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
        0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
        0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
        0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
        0x05aa0, 0x076a3, 0x096d0, 0x04bd7, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
        0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0
    ],
    nStr1: ['日', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'],
    nStr2: ['初', '十', '廿', '卅'],
    nStr3: ['','正','二','三','四','五','六','七','八','九','十','冬','臘'],
    isLeap: false, // --- ✨ 魔法修正施展處：為星盤加上記憶水晶 ✨ ---
    getLunarDay: function(solarYear, solarMonth, solarDay) {
        // --- ✨ 魔法修正施展處：每一次觀測前，都先將水晶擦拭乾淨！ ✨ ---
        this.isLeap = false;
        let sD = new Date(solarYear, solarMonth - 1, solarDay);
        let lD = new Date(1900, 0, 31);
        let lY, lM, lD2, tmp, leap, offset = (sD.getTime() - lD.getTime()) / 86400000;
        for (lY = 1900; lY < 2050 && offset > 0; lY++) {
            tmp = this.lYearDays(lY);
            offset -= tmp;
        }
        if (offset < 0) {
            offset += tmp;
            lY--;
        }
        leap = this.leapMonth(lY);
        for (lM = 1; lM < 13 && offset > 0; lM++) {
            if (leap > 0 && lM == (leap + 1) && !this.isLeap) {
                --lM;
                this.isLeap = true;
                tmp = this.leapDays(lY);
            } else {
                tmp = this.monthDays(lY, lM);
            }
            if (this.isLeap && lM == (leap + 1)) this.isLeap = false;
            offset -= tmp;
        }
        if (offset == 0 && leap > 0 && lM == leap + 1) {
            if (this.isLeap) {
                this.isLeap = false;
            } else {
                this.isLeap = true;
                --lM;
            }
        }
        if (offset < 0) {
            offset += tmp;
            --lM;
        }
        lD2 = offset + 1;
        return {
            month: this.nStr3[lM] + '月',
            day: this.toChinaDay(lD2)
        };
    },
    lYearDays: function(y) {
        let i, sum = 348;
        for (i = 0x8000; i > 0x8; i >>= 1) sum += (this.lunarInfo[y - 1900] & i) ? 1 : 0;
        return (sum + this.leapDays(y));
    },
    leapDays: function(y) {
        if (this.leapMonth(y)) return ((this.lunarInfo[y - 1900] & 0x10000) ? 30 : 29);
        else return (0);
    },
    leapMonth: function(y) { return (this.lunarInfo[y - 1900] & 0xf); },
    monthDays: function(y, m) { return ((this.lunarInfo[y - 1900] & (0x10000 >> m)) ? 30 : 29); },
    toChinaDay: function(d) {
        let s;
        switch (d) {
            case 10: s = '初十'; break;
            case 20: s = '二十'; break;
            case 30: s = '三十'; break;
            default:
                s = this.nStr2[Math.floor(d / 10)];
                s += this.nStr1[d % 10];
        }
        return (s);
    }
};

/**
 * 更新時鐘顯示的咒語
 */
export function updateClock() {
    const now = new Date();
    const lunarDate = lunarData.getLunarDay(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const dateString = now.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    
    if(ui.currentDate) ui.currentDate.innerText = `${dateString} 農曆 ${lunarDate.month}${lunarDate.day}`;
    if(ui.currentTime) ui.currentTime.innerText = now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
