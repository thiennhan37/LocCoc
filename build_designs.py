import json
import os
import subprocess

with open(r'd:\PTPM_HDV\LocCoc\processed_assets\b64_assets.json', 'r', encoding='utf-8') as f:
    b64 = json.load(f)

# Common SVG definitions
status_bar_svg = """
<div class="status-bar">
    <span class="time">9:41</span>
    <div class="status-icons">
        <svg class="signal-icon" width="17" height="12" viewBox="0 0 17 12" fill="#1F2328">
            <rect x="0" y="8" width="3" height="4" rx="0.8"/>
            <rect x="4.5" y="5.5" width="3" height="6.5" rx="0.8"/>
            <rect x="9" y="3" width="3" height="9" rx="0.8"/>
            <rect x="13.5" y="0" width="3" height="12" rx="0.8"/>
        </svg>
        <svg class="wifi-icon" width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="#1F2328" stroke-width="1.8" stroke-linecap="round">
            <path d="M1.5 3.5C5.5 -0.5 10.5 -0.5 14.5 3.5"/>
            <path d="M4 6.5C6.5 4 9.5 4 12 6.5"/>
            <circle cx="8" cy="10" r="1.1" fill="#1F2328" stroke="none"/>
        </svg>
        <div class="battery-wrap">
            <div class="battery-body">
                <div class="battery-fill"></div>
            </div>
            <div class="battery-cap"></div>
        </div>
    </div>
</div>
"""

home_indicator_html = """
<div class="home-indicator-wrap">
    <div class="home-indicator"></div>
</div>
"""

# ----------------- HOME HTML -----------------
home_html = f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>LocCoc - Home</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
* {{
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    -webkit-font-smoothing: antialiased;
}}

body {{
    width: 390px;
    height: 844px;
    overflow: hidden;
    background-color: #FAF8F5;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
    color: #24211E;
    position: relative;
    user-select: none;
}}

/* Status Bar */
.status-bar {{
    height: 44px;
    padding: 14px 24px 0 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}}
.status-bar .time {{
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.3px;
    color: #1F2328;
}}
.status-icons {{
    display: flex;
    align-items: center;
    gap: 7px;
}}
.battery-wrap {{
    display: flex;
    align-items: center;
    gap: 1.5px;
}}
.battery-body {{
    width: 23px;
    height: 12px;
    border: 1.5px solid #1F2328;
    border-radius: 3.5px;
    padding: 1.5px;
}}
.battery-fill {{
    width: 100%;
    height: 100%;
    background-color: #1F2328;
    border-radius: 1.5px;
}}
.battery-cap {{
    width: 1.5px;
    height: 4.5px;
    background-color: #1F2328;
    border-radius: 0 1px 1px 0;
}}

/* Main Content Container */
.main-content {{
    padding: 0 20px;
}}

/* Top Header */
.top-header {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 5px;
}}
.brand-wrap {{
    display: flex;
    align-items: center;
}}
.brand-name {{
    font-size: 27px;
    font-weight: 800;
    color: #FF6B5F;
    letter-spacing: -0.8px;
    line-height: 1;
}}
.brand-sparkle {{
    color: #FF6B5F;
    font-size: 20px;
    margin-left: 3px;
    display: inline-block;
    line-height: 1;
}}
.user-greeting {{
    display: flex;
    align-items: center;
    gap: 9px;
}}
.greeting-text {{
    font-size: 13px;
    font-weight: 500;
    color: #58534C;
}}
.header-avatar {{
    width: 38px;
    height: 38px;
    border-radius: 50%;
    object-fit: cover;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}}

/* Title Section */
.title-section {{
    margin-top: 16px;
}}
.main-title {{
    font-size: 25px;
    font-weight: 800;
    color: #24211E;
    letter-spacing: -0.6px;
    line-height: 1.2;
}}
.main-subtitle {{
    font-size: 13.5px;
    font-weight: 400;
    color: #8C8681;
    margin-top: 4px;
}}

/* Stories Row */
.stories-row {{
    display: flex;
    gap: 13px;
    margin-top: 16px;
    align-items: flex-start;
}}
.story-item {{
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 56px;
}}
.story-add-circle {{
    width: 54px;
    height: 54px;
    border-radius: 50%;
    background-color: #FFF0ED;
    border: 1.5px solid #FFDDD7;
    display: flex;
    align-items: center;
    justify-content: center;
}}
.story-ring {{
    width: 54px;
    height: 54px;
    border-radius: 50%;
    border: 2px solid #FF6B5F;
    padding: 2.5px;
    background-color: #FFFFFF;
    display: flex;
    align-items: center;
    justify-content: center;
}}
.story-img {{
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    display: block;
}}
.story-name {{
    font-size: 11px;
    font-weight: 600;
    color: #383431;
    margin-top: 6px;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 56px;
}}
.story-name-muted {{
    color: #6D6862;
    font-weight: 500;
}}

/* Featured Post Card */
.featured-card {{
    margin-top: 18px;
    background: #FAF8F6;
    border-radius: 26px;
    border: 1px solid #EFEAE4;
    overflow: hidden;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.03);
}}
.card-media-wrap {{
    position: relative;
    width: 100%;
    height: 310px;
    overflow: hidden;
    background-color: #EFECE8;
}}
.card-img {{
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}}
.author-pill {{
    position: absolute;
    top: 12px;
    left: 12px;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(10px);
    border-radius: 9999px;
    padding: 4px 12px 4px 4px;
    display: flex;
    align-items: center;
    gap: 7px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}}
.author-mini-img {{
    width: 22px;
    height: 22px;
    border-radius: 50%;
    object-fit: cover;
}}
.author-pill-text {{
    font-size: 11.5px;
    font-weight: 600;
    color: #24211E;
}}
.badge-close-friends {{
    position: absolute;
    bottom: 12px;
    right: 12px;
    background: rgba(22, 25, 28, 0.72);
    backdrop-filter: blur(8px);
    border-radius: 9999px;
    padding: 5px 11px;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}}
.badge-text {{
    font-size: 11px;
    font-weight: 500;
    color: #FFFFFF;
}}
.card-bottom {{
    padding: 13px 16px 15px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
}}
.card-title {{
    font-size: 15px;
    font-weight: 700;
    color: #24211E;
    letter-spacing: -0.2px;
}}
.card-desc {{
    font-size: 12.5px;
    font-weight: 400;
    color: #8C8681;
    margin-top: 3px;
}}
.fav-btn {{
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #FFFFFF;
    border: 1px solid #ECE7E1;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(0,0,0,0.04);
}}

/* Action Button */
.action-button {{
    margin-top: 16px;
    height: 56px;
    background: linear-gradient(135deg, #FF6F63 0%, #FF5A4D 100%);
    border-radius: 20px;
    padding: 0 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 6px 20px rgba(255, 107, 95, 0.32);
}}
.action-left {{
    display: flex;
    align-items: center;
    gap: 13px;
}}
.action-cam-box {{
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
}}
.action-title {{
    font-size: 14.5px;
    font-weight: 700;
    color: #FFFFFF;
    letter-spacing: -0.2px;
}}
.action-sub {{
    font-size: 11px;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.9);
    margin-top: 1px;
}}

/* Bottom Navigation */
.bottom-nav {{
    position: absolute;
    bottom: 0;
    left: 0;
    width: 390px;
    height: 76px;
    background: #FFFFFF;
    border-top: 1px solid #EFEAE4;
    display: flex;
    justify-content: space-around;
    padding-top: 9px;
}}
.nav-tab {{
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 75px;
}}
.nav-label {{
    font-size: 10px;
    font-weight: 600;
    margin-top: 4px;
}}
.nav-active {{
    color: #FF6B5F;
}}
.nav-inactive {{
    color: #9E9791;
}}
.nav-inactive .nav-label {{
    font-weight: 500;
}}

/* Home Indicator */
.home-indicator-wrap {{
    position: absolute;
    bottom: 6px;
    left: 0;
    width: 390px;
    display: flex;
    justify-content: center;
    pointer-events: none;
}}
.home-indicator {{
    width: 134px;
    height: 5px;
    background-color: #24211E;
    border-radius: 100px;
}}
</style>
</head>
<body>

{status_bar_svg}

<div class="main-content">
    <!-- Top Header -->
    <div class="top-header">
        <div class="brand-wrap">
            <span class="brand-name">LocCoc</span>
            <span class="brand-sparkle">✦</span>
        </div>
        <div class="user-greeting">
            <span class="greeting-text">Chào, Minh Anh</span>
            <img class="header-avatar" src="{b64['minh_anh_circle.png']}" alt="Minh Anh">
        </div>
    </div>

    <!-- Title Section -->
    <div class="title-section">
        <h1 class="main-title">Một chút hôm nay.</h1>
        <p class="main-subtitle">Những điều nhỏ xíu, gửi người thân yêu.</p>
    </div>

    <!-- Stories Row -->
    <div class="stories-row">
        <div class="story-item">
            <div class="story-add-circle">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF6B5F" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <span class="story-name story-name-muted">Mời bạn</span>
        </div>
        <div class="story-item">
            <div class="story-ring">
                <img class="story-img" src="{b64['story_linh_clean.png']}" alt="Linh">
            </div>
            <span class="story-name">Linh</span>
        </div>
        <div class="story-item">
            <div class="story-ring">
                <img class="story-img" src="{b64['story_nam_clean.png']}" alt="Nam">
            </div>
            <span class="story-name">Nam</span>
        </div>
        <div class="story-item">
            <div class="story-ring">
                <img class="story-img" src="{b64['story_thaovy_clean.png']}" alt="Thảo Vy">
            </div>
            <span class="story-name">Thảo Vy</span>
        </div>
        <div class="story-item">
            <div class="story-ring">
                <img class="story-img" src="{b64['story_ban_clean.png']}" alt="Bạn">
            </div>
            <span class="story-name">Bạn</span>
        </div>
    </div>

    <!-- Featured Post Card -->
    <div class="featured-card">
        <div class="card-media-wrap">
            <img class="card-img" src="{b64['coffee_full.png']}" alt="Cà phê và chuyện chúng mình">
            <div class="author-pill">
                <img class="author-mini-img" src="{b64['story_linh_clean.png']}" alt="Linh">
                <span class="author-pill-text">Linh • 2 phút trước</span>
            </div>
            <div class="badge-close-friends">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <span class="badge-text">Chỉ bạn thân</span>
            </div>
        </div>
        <div class="card-bottom">
            <div class="card-info">
                <div class="card-title">Cà phê và chuyện chúng mình ☕</div>
                <div class="card-desc">Một chiều thật chậm ở Hà Nội</div>
            </div>
            <div class="fav-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF6B5F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </div>
        </div>
    </div>

    <!-- Action Button -->
    <div class="action-button">
        <div class="action-left">
            <div class="action-cam-box">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </div>
            <div>
                <div class="action-title">Gửi một khoảnh khắc</div>
                <div class="action-sub">Chụp nhanh, gần nhau hơn.</div>
            </div>
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
    </div>
</div>

<!-- Bottom Navigation Bar -->
<div class="bottom-nav">
    <div class="nav-tab nav-active">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span class="nav-label">Trang chủ</span>
    </div>
    <div class="nav-tab nav-inactive">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" ry="4"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span class="nav-label">Kỷ niệm</span>
    </div>
    <div class="nav-tab nav-inactive">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span class="nav-label">Cá nhân</span>
    </div>
</div>

{home_indicator_html}

</body>
</html>
"""

with open(r'd:\PTPM_HDV\LocCoc\Home.html', 'w', encoding='utf-8') as f:
    f.write(home_html)

# ----------------- PROFILE HTML -----------------
profile_html = f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>LocCoc - Profile</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
* {{
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    -webkit-font-smoothing: antialiased;
}}

body {{
    width: 390px;
    height: 844px;
    overflow: hidden;
    background-color: #FAF8F5;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
    color: #24211E;
    position: relative;
    user-select: none;
}}

/* Status Bar */
.status-bar {{
    height: 44px;
    padding: 14px 24px 0 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}}
.status-bar .time {{
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.3px;
    color: #1F2328;
}}
.status-icons {{
    display: flex;
    align-items: center;
    gap: 7px;
}}
.battery-wrap {{
    display: flex;
    align-items: center;
    gap: 1.5px;
}}
.battery-body {{
    width: 23px;
    height: 12px;
    border: 1.5px solid #1F2328;
    border-radius: 3.5px;
    padding: 1.5px;
}}
.battery-fill {{
    width: 100%;
    height: 100%;
    background-color: #1F2328;
    border-radius: 1.5px;
}}
.battery-cap {{
    width: 1.5px;
    height: 4.5px;
    background-color: #1F2328;
    border-radius: 0 1px 1px 0;
}}

/* Main Content Container */
.main-content {{
    padding: 0 20px;
}}

/* Top Navigation Bar */
.top-nav-bar {{
    height: 46px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 4px;
}}
.nav-circle-btn {{
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: #FAF8F6;
    border: 1px solid #ECE7E1;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 4px rgba(0,0,0,0.03);
}}
.nav-title {{
    font-size: 17.5px;
    font-weight: 700;
    color: #24211E;
    letter-spacing: -0.3px;
}}

/* Profile Header Section */
.profile-header {{
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 15px;
    text-align: center;
}}
.avatar-container {{
    position: relative;
    width: 90px;
    height: 90px;
}}
.avatar-ring {{
    width: 90px;
    height: 90px;
    border-radius: 50%;
    border: 2.8px solid #FF6B5F;
    padding: 2.5px;
    background-color: #FFFFFF;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 3px 14px rgba(255, 107, 95, 0.16);
}}
.profile-avatar-img {{
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    display: block;
}}
.avatar-cam-badge {{
    position: absolute;
    bottom: 0;
    right: 0;
    width: 27px;
    height: 27px;
    border-radius: 50%;
    background-color: #FF6B5F;
    border: 2.2px solid #FFFFFF;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(0,0,0,0.12);
}}
.profile-name {{
    font-size: 23px;
    font-weight: 800;
    color: #24211E;
    letter-spacing: -0.4px;
    margin-top: 10px;
}}
.profile-username {{
    font-size: 13.5px;
    font-weight: 500;
    color: #8C8681;
    margin-top: 2px;
}}
.profile-bio {{
    font-size: 13px;
    font-weight: 400;
    color: #55504A;
    margin-top: 6px;
}}

/* Stats Row */
.stats-card {{
    margin-top: 18px;
    background: #FAF8F6;
    border-radius: 20px;
    border: 1px solid #EFEAE4;
    padding: 14px 0;
    display: flex;
    align-items: center;
    justify-content: space-around;
}}
.stat-col {{
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
}}
.stat-num {{
    font-size: 21px;
    font-weight: 800;
    color: #24211E;
    letter-spacing: -0.3px;
    line-height: 1.1;
}}
.stat-label {{
    font-size: 11.5px;
    font-weight: 400;
    color: #8C8681;
    margin-top: 3px;
}}
.stat-divider {{
    width: 1px;
    height: 28px;
    background-color: #E6E1DB;
}}

/* Edit Profile Button */
.edit-profile-btn {{
    margin-top: 14px;
    height: 46px;
    background-color: #FFF0ED;
    border: 1px solid #FFDDD7;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
}}
.edit-profile-text {{
    font-size: 14px;
    font-weight: 600;
    color: #FF6B5F;
}}

/* Memory Gallery Section */
.gallery-section {{
    margin-top: 20px;
}}
.gallery-header {{
    display: flex;
    justify-content: space-between;
    align-items: center;
}}
.gallery-title {{
    font-size: 16.5px;
    font-weight: 700;
    color: #24211E;
    letter-spacing: -0.2px;
}}
.gallery-more {{
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    color: #FF6B5F;
}}
.gallery-grid {{
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-top: 10px;
}}
.memory-card {{
    position: relative;
    height: 134px;
    border-radius: 18px;
    overflow: hidden;
    background-color: #EFECE8;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}}
.memory-img {{
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}}
.memory-gradient {{
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(15, 18, 20, 0.78) 0%, rgba(15, 18, 20, 0.1) 45%, transparent 100%);
}}
.memory-tag {{
    position: absolute;
    bottom: 9px;
    left: 9px;
    font-size: 11px;
    font-weight: 600;
    color: #FFFFFF;
    text-shadow: 0 1px 3px rgba(0,0,0,0.4);
}}

/* Settings / Privacy Card */
.settings-card {{
    margin-top: 18px;
    background: #FAF8F6;
    border-radius: 20px;
    border: 1px solid #EFEAE4;
    padding: 0 16px;
}}
.settings-row {{
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
}}
.settings-left {{
    display: flex;
    align-items: center;
    gap: 12px;
}}
.settings-title {{
    font-size: 14px;
    font-weight: 600;
    color: #24211E;
}}
.settings-right {{
    display: flex;
    align-items: center;
    gap: 4px;
}}
.settings-count {{
    font-size: 12.5px;
    font-weight: 400;
    color: #8C8681;
}}
.settings-divider {{
    height: 1px;
    background-color: #EFEAE4;
}}

/* Bottom Navigation */
.bottom-nav {{
    position: absolute;
    bottom: 0;
    left: 0;
    width: 390px;
    height: 76px;
    background: #FFFFFF;
    border-top: 1px solid #EFEAE4;
    display: flex;
    justify-content: space-around;
    padding-top: 9px;
}}
.nav-tab {{
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 75px;
}}
.nav-label {{
    font-size: 10px;
    font-weight: 600;
    margin-top: 4px;
}}
.nav-active {{
    color: #FF6B5F;
}}
.nav-inactive {{
    color: #9E9791;
}}
.nav-inactive .nav-label {{
    font-weight: 500;
}}

/* Home Indicator */
.home-indicator-wrap {{
    position: absolute;
    bottom: 6px;
    left: 0;
    width: 390px;
    display: flex;
    justify-content: center;
    pointer-events: none;
}}
.home-indicator {{
    width: 134px;
    height: 5px;
    background-color: #24211E;
    border-radius: 100px;
}}
</style>
</head>
<body>

{status_bar_svg}

<div class="main-content">
    <!-- Top Navigation Bar -->
    <div class="top-nav-bar">
        <div class="nav-circle-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#24211E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </div>
        <div class="nav-title">Hồ sơ cá nhân</div>
        <div class="nav-circle-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#24211E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        </div>
    </div>

    <!-- Profile Header Section -->
    <div class="profile-header">
        <div class="avatar-container">
            <div class="avatar-ring">
                <img class="profile-avatar-img" src="{b64['minh_anh_circle.png']}" alt="Minh Anh">
            </div>
            <div class="avatar-cam-badge">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </div>
        </div>
        <div class="profile-name">Minh Anh</div>
        <div class="profile-username">@minhanh</div>
        <div class="profile-bio">Gom những ngày bình thường đáng nhớ.</div>
    </div>

    <!-- Stats Row -->
    <div class="stats-card">
        <div class="stat-col">
            <div class="stat-num">128</div>
            <div class="stat-label">Khoảnh khắc</div>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-col">
            <div class="stat-num">8</div>
            <div class="stat-label">Bạn thân</div>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-col">
            <div class="stat-num">24</div>
            <div class="stat-label">Ngày bên nhau</div>
        </div>
    </div>

    <!-- Edit Profile Button -->
    <div class="edit-profile-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FF6B5F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
        <span class="edit-profile-text">Chỉnh sửa hồ sơ</span>
    </div>

    <!-- Memory Gallery Section -->
    <div class="gallery-section">
        <div class="gallery-header">
            <div class="gallery-title">Góc kỷ niệm</div>
            <div class="gallery-more">
                <span>Xem tất cả</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF6B5F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </div>
        </div>
        <div class="gallery-grid">
            <div class="memory-card">
                <img class="memory-img" src="{b64['p1_sunset.png']}" alt="Hôm nay">
                <div class="memory-gradient"></div>
                <span class="memory-tag">Hôm nay</span>
            </div>
            <div class="memory-card">
                <img class="memory-img" src="{b64['p2_cat.png']}" alt="24 tháng 10">
                <div class="memory-gradient"></div>
                <span class="memory-tag">24 tháng 10</span>
            </div>
            <div class="memory-card">
                <img class="memory-img" src="{b64['p3_coffee.png']}" alt="23 tháng 10">
                <div class="memory-gradient"></div>
                <span class="memory-tag">23 tháng 10</span>
            </div>
        </div>
    </div>

    <!-- Settings / Privacy Card -->
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-left">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF6B5F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <span class="settings-title">Vòng tròn bạn thân</span>
            </div>
            <div class="settings-right">
                <span class="settings-count">8 người</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B5B0AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-row">
            <div class="settings-left">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF6B5F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                <span class="settings-title">Cài đặt & quyền riêng tư</span>
            </div>
            <div class="settings-right">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B5B0AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
        </div>
    </div>
</div>

<!-- Bottom Navigation Bar -->
<div class="bottom-nav">
    <div class="nav-tab nav-inactive">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span class="nav-label">Trang chủ</span>
    </div>
    <div class="nav-tab nav-inactive">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" ry="4"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span class="nav-label">Kỷ niệm</span>
    </div>
    <div class="nav-tab nav-active">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span class="nav-label">Cá nhân</span>
    </div>
</div>

{home_indicator_html}

</body>
</html>
"""

with open(r'd:\PTPM_HDV\LocCoc\Profile.html', 'w', encoding='utf-8') as f:
    f.write(profile_html)

print('Updated build_designs.py completed')
