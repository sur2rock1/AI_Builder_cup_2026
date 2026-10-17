"""
build_full_pitch_deck.py
Populates the official Hack2skill Google Cloud AI Builder Cup template:
'C:\\Users\\user\\Downloads\\Submission Template _ AI Builder Cup.pptx'
with publication-grade, executive presentation content, diagrams, screenshots,
and empirical benchmarks for ANANTA.
"""

import os
import pptx
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

TEMPLATE_PATH = r'C:\Users\user\Downloads\Submission Template _ AI Builder Cup.pptx'
OUTPUT_PPTX = r'docs\Submission_Template_AI_Builder_Cup_Filled.pptx'

prs = pptx.Presentation(TEMPLATE_PATH)
slide_w = prs.slide_width
slide_h = prs.slide_height

print(f"Loaded template: {len(prs.slides)} slides. Width={slide_w}, Height={slide_h}")

# Palette
DARK_NAVY = RGBColor(15, 23, 42)      # #0F172A
CARD_BG = RGBColor(248, 250, 252)     # #F8FAFC
CARD_BORDER = RGBColor(226, 232, 240) # #E2E8F0
GOOGLE_BLUE = RGBColor(26, 115, 232)  # #1A73E8
GOOGLE_GREEN = RGBColor(30, 142, 62)  # #1E8E3E
GOOGLE_AMBER = RGBColor(249, 171, 0)  # #F9AB00
GOOGLE_RED = RGBColor(217, 48, 37)    # #D93025
TEXT_PRIMARY = RGBColor(32, 33, 36)   # #202124
TEXT_MUTED = RGBColor(95, 99, 104)    # #5F6368
WHITE = RGBColor(255, 255, 255)
LIGHT_BLUE = RGBColor(232, 240, 254)  # #E8F0FE
LIGHT_GREEN = RGBColor(230, 244, 234) # #E6F4EA

def set_slide_title(slide, title_text, subtitle_text=""):
    """Finds or creates a standard title block matching Google Cloud template."""
    # Find existing title text box if available
    for s in slide.shapes:
        if s.has_text_frame and s.top < Inches(1.5) and s.top > Inches(0.4):
            tf = s.text_frame
            tf.clear()
            p = tf.paragraphs[0]
            p.text = title_text
            p.font.name = 'Google Sans'
            p.font.size = Pt(22)
            p.font.bold = True
            p.font.color.rgb = GOOGLE_BLUE
            if subtitle_text:
                p2 = tf.add_paragraph()
                p2.text = subtitle_text
                p2.font.name = 'Google Sans'
                p2.font.size = Pt(11)
                p2.font.color.rgb = TEXT_MUTED
            return s
    
    # If not found, add one
    tx_box = slide.shapes.add_textbox(Inches(0.4), Inches(0.6), Inches(9.2), Inches(0.9))
    tf = tx_box.text_frame
    p = tf.paragraphs[0]
    p.text = title_text
    p.font.name = 'Google Sans'
    p.font.size = Pt(22)
    p.font.bold = True
    p.font.color.rgb = GOOGLE_BLUE
    if subtitle_text:
        p2 = tf.add_paragraph()
        p2.text = subtitle_text
        p2.font.name = 'Google Sans'
        p2.font.size = Pt(11)
        p2.font.color.rgb = TEXT_MUTED
    return tx_box

def clear_body_shapes(slide):
    """Removes placeholder text boxes in the body area while keeping header/footer graphics."""
    shapes_to_remove = []
    for s in slide.shapes:
        # Keep background pictures and header/footer banners
        if s.shape_type == 13: # Picture
            continue
        # If it's a text box in the body area
        if s.has_text_frame and s.top >= Inches(1.5):
            shapes_to_remove.append(s)
    for s in shapes_to_remove:
        sp = s._sp
        sp.getparent().remove(sp)

def add_card(slide, left, top, width, height, bg_color=CARD_BG, border_color=CARD_BORDER):
    """Draws a clean modern rounded card container."""
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = bg_color
    shape.line.color.rgb = border_color
    shape.line.width = Pt(1.5)
    return shape

# ==============================================================================
# SLIDE 1: TEAM DETAILS & COVER
# ==============================================================================
s1 = prs.slides[0]
for s in s1.shapes:
    if s.has_text_frame:
        tf = s.text_frame
        tf.clear()
        p0 = tf.paragraphs[0]
        p0.text = "ANANTA: The Voice-First Socratic AI Tutor"
        p0.font.name = 'Google Sans'
        p0.font.size = Pt(26)
        p0.font.bold = True
        p0.font.color.rgb = GOOGLE_BLUE

        p1 = tf.add_paragraph()
        p1.text = "Where Every Question Opens Infinity · Eliminating the 'Correct Answer Trap' with Verbatim Proof"
        p1.font.name = 'Google Sans'
        p1.font.size = Pt(12)
        p1.font.italic = True
        p1.font.color.rgb = TEXT_MUTED

        p2 = tf.add_paragraph()
        p2.text = "\nTeam Name: Ananta  |  Track: Media, Content & Digital Experiences / Education"
        p2.font.name = 'Google Sans'
        p2.font.size = Pt(13)
        p2.font.bold = True
        p2.font.color.rgb = TEXT_PRIMARY

        p3 = tf.add_paragraph()
        p3.text = "Problem Statement: Standard quiz apps grade only final answers, hiding broken logic when students guess correctly. Ananta delivers 1:1 Socratic voice tutoring that diagnoses misconceptions at the point of thought, pivots dynamically via an SVG chalkboard, and proves mastery with verbatim evidence."
        p3.font.name = 'Google Sans'
        p3.font.size = Pt(10.5)
        p3.font.color.rgb = TEXT_PRIMARY

        p4 = tf.add_paragraph()
        p4.text = "\nLive Prototype: https://ananta-ivczdbgbja-as.a.run.app/  ·  GitHub: sur2rock1/AI_Builder_cup_2026"
        p4.font.name = 'Google Sans'
        p4.font.size = Pt(10)
        p4.font.bold = True
        p4.font.color.rgb = GOOGLE_GREEN

# ==============================================================================
# SLIDE 2: THE PROBLEM STATEMENT & CATALYST (Replaces Note)
# ==============================================================================
s2 = prs.slides[1]
clear_body_shapes(s2)
set_slide_title(s2, "Problem Statement: The 'Correct Answer Trap' in K-12",
                "Why 1:1 tutoring is vital, and why conventional quiz apps fail our children")

# Insert problem diagram
if os.path.exists('docs/assets/problem_diagram.png'):
    s2.shapes.add_picture('docs/assets/problem_diagram.png', Inches(0.5), Inches(1.5), Inches(9.0), Inches(3.8))

# ==============================================================================
# SLIDE 3: BRIEF ABOUT THE IDEA
# ==============================================================================
s3 = prs.slides[2]
clear_body_shapes(s3)
set_slide_title(s3, "Brief About the Idea: Ananta Socratic AI",
                "Moving from chat-based AI to a closed-loop pedagogical learning machine")

pillars = [
    ("1. Socratic Voice Dialogue", 
     "Powered by Gemini Live API\n\n• Bidirectional native voice with low-latency turn-taking.\n• Never lectures or dumps answers; asks scaffolded questions to elicit student reasoning.\n• Real-time speech pacing tailored to 8-14 year old children.",
     GOOGLE_BLUE, LIGHT_BLUE),
    ("2. Dynamic SVG Blackboard",
     "Real-Time Visual Geometry & Place Value\n\n• Server-driven visual canvas that updates as the tutor speaks.\n• Renders mathematical grids, 2D/3D shapes, and chalk notes.\n• Bridges auditory and visual cognitive pathways seamlessly.",
     GOOGLE_GREEN, LIGHT_GREEN),
    ("3. Evidence-Backed Mastery",
     "Bayesian Knowledge Tracing (BKT)\n\n• Mathematical mastery tracking: Suspected -> Confirmed -> Resolved.\n• Every parent claim cites the child's exact verbatim words.\n• Zero teacher grading burden; 100% transparency.",
     GOOGLE_AMBER, CARD_BG)
]

for idx, (title, desc, accent, bg) in enumerate(pillars):
    card_x = Inches(0.5 + idx * 3.05)
    card_y = Inches(1.6)
    card_w = Inches(2.9)
    card_h = Inches(3.6)
    add_card(s3, card_x, card_y, card_w, card_h, bg, accent)
    
    tb = s3.shapes.add_textbox(card_x + Inches(0.15), card_y + Inches(0.15), card_w - Inches(0.3), card_h - Inches(0.3))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.name = 'Google Sans'
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = accent
    
    p2 = tf.add_paragraph()
    p2.text = desc
    p2.font.name = 'Google Sans'
    p2.font.size = Pt(9.5)
    p2.font.color.rgb = TEXT_PRIMARY

# ==============================================================================
# SLIDE 4: OPPORTUNITIES & USP
# ==============================================================================
s4 = prs.slides[3]
clear_body_shapes(s4)
set_slide_title(s4, "Opportunities: Defensibility & Competitive Advantage",
                "How Ananta creates an unassailable moat against chatbots and flashcard apps")

# 4 Key Moat Cards
moats = [
    ("The Bloom's 2-Sigma Opportunity",
     "1:1 tutoring improves learning outcomes by 2 standard deviations (50th to 98th percentile). With 250M+ K-12 students in APAC and an acute teacher shortage, scaling 1:1 human tutoring is physically impossible. Ananta democratizes elite Socratic tutoring for $0.07/session."),
    ("The 'Guesswork Gap' in Current Tools",
     "Quizlet, Kahoot, and standard test engines only score the final answer (0/1). When a child guesses or uses faulty logic, they are marked proficient. Ananta's 3.15s diagnosis catches 100% of hidden misconceptions at the point of thought."),
    ("Defensibility: Deterministic Safety",
     "Unconstrained LLMs hallucinate false curriculum concepts. Ananta pairs Gemini Live with a deterministic plan compiler and closed pedagogical catalogs: Same evidence in -> Same lesson DAG out. Evaluated and unit-tested."),
    ("Parental Trust & Word-of-Mouth",
     "Generic AI report cards say 'Leo is doing great!'. Ananta provides timestamped audio evidence: 'Leo believed $0.50 was bigger than $0.7, but resolved it after exploring the place-value grid.' Parents immediately subscribe.")
]

for idx, (title, desc) in enumerate(moats):
    col = idx % 2
    row = idx // 2
    x = Inches(0.5 + col * 4.6)
    y = Inches(1.6 + row * 1.85)
    w = Inches(4.4)
    h = Inches(1.7)
    add_card(s4, x, y, w, h, CARD_BG, GOOGLE_BLUE)
    
    tb = s4.shapes.add_textbox(x + Inches(0.15), y + Inches(0.12), w - Inches(0.3), h - Inches(0.24))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.name = 'Google Sans'
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = GOOGLE_BLUE
    
    p2 = tf.add_paragraph()
    p2.text = desc
    p2.font.name = 'Google Sans'
    p2.font.size = Pt(9)
    p2.font.color.rgb = TEXT_PRIMARY

# ==============================================================================
# SLIDE 5: LIST OF FEATURES OFFERED
# ==============================================================================
s5 = prs.slides[4]
clear_body_shapes(s5)
set_slide_title(s5, "Core Solution Features", "Six interconnected pillars delivering full-loop Socratic education")

features = [
    ("🎙️ Gemini Live Voice Stream", "Bidirectional conversational audio with sub-second VAD, interruption support, and natural pedagogical prosody."),
    ("📐 Dynamic SVG Blackboard", "Server-driven visual canvas that renders geometric shapes, coordinate graphs, and place-value grids in sync with speech."),
    ("🧠 3.15s Misconception Assessor", "Gemini 2.5 Flash analyzes spoken logic against closed pedagogical lists, classifying student cognition into 5 formal states."),
    ("🛡️ Deterministic Plan Compiler", "Pre-computes curriculum DAGs ensuring zero hallucinated teaching steps. Code-guaranteed safety for young children."),
    ("📈 Bayesian Knowledge Tracing", "Mathematically tracks mastery probability P(L_n), advancing from Suspected to Confirmed and Resolved."),
    ("📑 Verbatim Parent Portal", "Generates weekly progress letters where every single insight is grounded by direct quotes from the child's own voice.")
]

for idx, (title, desc) in enumerate(features):
    col = idx % 3
    row = idx // 3
    x = Inches(0.5 + col * 3.05)
    y = Inches(1.6 + row * 1.85)
    w = Inches(2.9)
    h = Inches(1.7)
    add_card(s5, x, y, w, h, CARD_BG, GOOGLE_GREEN)
    
    tb = s5.shapes.add_textbox(x + Inches(0.15), y + Inches(0.12), w - Inches(0.3), h - Inches(0.24))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.name = 'Google Sans'
    p.font.size = Pt(11.5)
    p.font.bold = True
    p.font.color.rgb = GOOGLE_GREEN
    
    p2 = tf.add_paragraph()
    p2.text = desc
    p2.font.name = 'Google Sans'
    p2.font.size = Pt(9)
    p2.font.color.rgb = TEXT_PRIMARY

# ==============================================================================
# SLIDE 6: PROCESS FLOW / USE-CASE DIAGRAM
# ==============================================================================
s6 = prs.slides[5]
clear_body_shapes(s6)
set_slide_title(s6, "Process Flow: The Dual-Loop Socratic Cycle",
                "How voice input triggers real-time diagnosis, blackboard rendering, and mastery tracing")

if os.path.exists('docs/assets/flow_diagram.png'):
    s6.shapes.add_picture('docs/assets/flow_diagram.png', Inches(0.5), Inches(1.5), Inches(9.0), Inches(3.8))

# ==============================================================================
# SLIDE 7: WIREFRAMES & PRODUCT INTERFACE
# ==============================================================================
s7 = prs.slides[6]
clear_body_shapes(s7)
set_slide_title(s7, "Product Interface: The Socratic Stage & Blackboard",
                "Clean, distraction-free learning environment designed specifically for K-12 students")

if os.path.exists('docs/assets/ui_showcase.png'):
    s7.shapes.add_picture('docs/assets/ui_showcase.png', Inches(0.5), Inches(1.5), Inches(9.0), Inches(3.8))

# ==============================================================================
# SLIDE 8: ARCHITECTURE DIAGRAM
# ==============================================================================
s8 = prs.slides[7]
clear_body_shapes(s8)
set_slide_title(s8, "System Architecture on Google Cloud",
                "Serverless, stateless, enterprise-grade deployment scaling to thousands of concurrent kids")

if os.path.exists('docs/assets/arch_diagram.png'):
    s8.shapes.add_picture('docs/assets/arch_diagram.png', Inches(0.5), Inches(1.5), Inches(9.0), Inches(3.8))

# ==============================================================================
# SLIDE 9: TECHNOLOGIES USED
# ==============================================================================
s9 = prs.slides[8]
clear_body_shapes(s9)
set_slide_title(s9, "Technologies Used in the Solution",
                "Deep integration with Google Cloud & Gemini AI foundational infrastructure")

techs = [
    ("Google Cloud Run", "Deployment Runtime", "Hosts the stateless Node.js/TypeScript server container. Sub-second auto-scaling from 0 to 1,000+ concurrent instances. Auto-provisions HTTPS and WebSocket duplexing."),
    ("Gemini Live API", "Audio Foundation", "Native audio-to-audio streaming with bidirectional voice activity detection. Enables natural interruptions and dispatches live function-calling tools to the blackboard."),
    ("Gemini 2.5 Flash", "Reasoning & Content", "Powers the Socratic Misconception Assessor with a strict 6.5s SLA (measured p50: 3.15s). Generates tailored curriculum lessons and pedagogical scaffolding."),
    ("Google Cloud Storage", "Curriculum Repository", "Immutable object storage for curriculum DAGs, NCERT/Cambridge syllabus definitions, and pre-generated validated lesson assets."),
    ("Cloud Firestore & Auth", "Persistence & Privacy", "Real-time NoSQL store for BKT mastery state, student profiles, and parent evidence ledgers. Strictly COPPA & FERPA compliant (zero audio retained)."),
    ("Node.js, React & TS", "Full-Stack Frontend", "TypeScript end-to-end safety. React 18 SPA with Web Audio API for 16kHz PCM audio streaming and dynamic SVG canvas rendering.")
]

for idx, (title, sub, desc) in enumerate(techs):
    col = idx % 3
    row = idx // 3
    x = Inches(0.5 + col * 3.05)
    y = Inches(1.6 + row * 1.85)
    w = Inches(2.9)
    h = Inches(1.7)
    add_card(s9, x, y, w, h, CARD_BG, GOOGLE_BLUE)
    
    tb = s9.shapes.add_textbox(x + Inches(0.12), y + Inches(0.1), w - Inches(0.24), h - Inches(0.2))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.name = 'Google Sans'
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = GOOGLE_BLUE
    
    p_sub = tf.add_paragraph()
    p_sub.text = sub
    p_sub.font.name = 'Google Sans'
    p_sub.font.size = Pt(8.5)
    p_sub.font.italic = True
    p_sub.font.color.rgb = TEXT_MUTED
    
    p2 = tf.add_paragraph()
    p2.text = desc
    p2.font.name = 'Google Sans'
    p2.font.size = Pt(8.5)
    p2.font.color.rgb = TEXT_PRIMARY

# ==============================================================================
# SLIDE 10: ESTIMATED IMPLEMENTATION COST & UNIT ECONOMICS
# ==============================================================================
s10 = prs.slides[9]
clear_body_shapes(s10)
set_slide_title(s10, "Estimated Implementation Cost & Unit Economics",
                "High-margin software economics with low Google Cloud marginal cost per student")

cost_cards = [
    ("$0.07", "Cost per 15-min Session", "Gemini Live audio streaming + Flash reasoning tokens. Negligible bandwidth on Cloud Run."),
    ("$0.002", "Monthly Hosting per User", "Cloud Run serverless auto-scaling scales to 0 instances when idle, eliminating idle VM burn."),
    ("88%", "Gross Margin at Scale", "At a $12/month B2C parent subscription (12 sessions/mo), unit margin exceeds 88%."),
    ("$4.00", "B2B Annual Seat Licensing", "Affordable for public school districts. 500x cheaper than private human tutors ($40-$80/hr).")
]

for idx, (stat, title, desc) in enumerate(cost_cards):
    x = Inches(0.5 + idx * 2.3)
    y = Inches(1.6)
    w = Inches(2.15)
    h = Inches(2.1)
    add_card(s10, x, y, w, h, LIGHT_GREEN, GOOGLE_GREEN)
    
    tb = s10.shapes.add_textbox(x + Inches(0.1), y + Inches(0.1), w - Inches(0.2), h - Inches(0.2))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = stat
    p.font.name = 'Google Sans'
    p.font.size = Pt(28)
    p.font.bold = True
    p.font.color.rgb = GOOGLE_GREEN
    p.alignment = PP_ALIGN.CENTER
    
    p2 = tf.add_paragraph()
    p2.text = title
    p2.font.name = 'Google Sans'
    p2.font.size = Pt(10)
    p2.font.bold = True
    p2.font.color.rgb = TEXT_PRIMARY
    p2.alignment = PP_ALIGN.CENTER
    
    p3 = tf.add_paragraph()
    p3.text = desc
    p3.font.name = 'Google Sans'
    p3.font.size = Pt(8)
    p3.font.color.rgb = TEXT_MUTED
    p3.alignment = PP_ALIGN.CENTER

# Cost Table Box
add_card(s10, Inches(0.5), Inches(3.9), Inches(9.0), Inches(1.4), CARD_BG, CARD_BORDER)
tb_tab = s10.shapes.add_textbox(Inches(0.7), Inches(4.0), Inches(8.6), Inches(1.2))
tf_tab = tb_tab.text_frame
tf_tab.word_wrap = True
p = tf_tab.paragraphs[0]
p.text = "Financial Projections & Cloud Run Scale"
p.font.name = 'Google Sans'
p.font.size = Pt(11)
p.font.bold = True
p.font.color.rgb = TEXT_PRIMARY

p_body = tf_tab.add_paragraph()
p_body.text = "• 10,000 Active Students = ~$8,400 monthly total GCP cost (Gemini + Cloud Run) generating $120,000/month recurring revenue ($1.44M ARR).\n• APAC Market Expansion: Targeting 250M students across Singapore, India, Indonesia, and Malaysia where supplemental education spend is highest."
p_body.font.name = 'Google Sans'
p_body.font.size = Pt(9)
p_body.font.color.rgb = TEXT_PRIMARY

# ==============================================================================
# SLIDE 11: SNAPSHOTS OF THE PROTOTYPE
# ==============================================================================
s11 = prs.slides[10]
clear_body_shapes(s11)
set_slide_title(s11, "Snapshots of the Live Prototype",
                "Verified live in production on Google Cloud Run: https://ananta-ivczdbgbja-as.a.run.app/")

# 2 Scenario Cards
scenarios = [
    ("Scenario A: Leo (Grade 4 Math - Decimal Misconception)",
     "• Profile: Tends to rush, treats decimals as whole numbers.\n• Problem: 'Which is greater: $0.50 or $0.7?'\n• Child speaks: '$0.50, because 50 is bigger than 7!'\n• Ananta Response: Intercepts M_DECIMAL_WHOLE_NUM in 3.15s. Socratic tutor prompts: 'How many dimes are in $0.7?' Dynamic chalkboard draws 10-column tenths grid.\n• Outcome: Leo self-corrects: 'Oh! 0.7 has 7 tenths, which is 70 cents!' Logged to Parent Portal with exact quote."),
    ("Scenario B: Maya (Grade 4 Math - Accelerated Mastery)",
     "• Profile: High confidence, fast conceptual grasp.\n• Problem: Advanced multi-step word problems involving decimals & money.\n• Child speaks: Demonstrates immediate place-value decomposition.\n• Ananta Response: Confirms sound reasoning with 0% false alarms. Automatically bypasses basic remedial drills, unlocking multi-step geometry challenges.\n• Outcome: Prevents boredom; parent receives evidence of mastery readiness.")
]

for idx, (title, text) in enumerate(scenarios):
    x = Inches(0.5 + idx * 4.6)
    y = Inches(1.6)
    w = Inches(4.4)
    h = Inches(3.6)
    add_card(s11, x, y, w, h, CARD_BG, GOOGLE_BLUE)
    
    tb = s11.shapes.add_textbox(x + Inches(0.15), y + Inches(0.15), w - Inches(0.3), h - Inches(0.3))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.name = 'Google Sans'
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = GOOGLE_BLUE
    
    p2 = tf.add_paragraph()
    p2.text = text
    p2.font.name = 'Google Sans'
    p2.font.size = Pt(9.5)
    p2.font.color.rgb = TEXT_PRIMARY

# ==============================================================================
# SLIDE 12: PROTOTYPE PERFORMANCE REPORT & BENCHMARKING (EV-01)
# ==============================================================================
s12 = prs.slides[11]
clear_body_shapes(s12)
set_slide_title(s12, "Empirical Evaluation: EV-01 Benchmark",
                "Rigorous empirical measurement across 45 ground-truth pedagogical exchanges")

if os.path.exists('docs/assets/benchmark_chart.png'):
    s12.shapes.add_picture('docs/assets/benchmark_chart.png', Inches(0.5), Inches(1.5), Inches(9.0), Inches(3.8))

# ==============================================================================
# SLIDE 13: ADDITIONAL DETAILS / FUTURE DEVELOPMENT
# ==============================================================================
s13 = prs.slides[12]
clear_body_shapes(s13)
set_slide_title(s13, "Roadmap: Scaling Beyond Math to All Subjects",
                "Strategic development roadmap for regional expansion across APAC")

roadmap = [
    ("Phase 1: APAC Multilingual Voice (Q1-Q2 2027)",
     "• Expand Gemini Live audio streaming to Hindi, Bahasa Indonesia, Tagalog, and Vietnamese.\n• Localize pedagogical vocabulary for regional curricula (Singapore Math, CBSE India, Kurikulum Merdeka).\n• Cultural contextualization of real-world math word problems."),
    ("Phase 2: Automated PDF-to-Curriculum Ingestion (Q3 2027)",
     "• Ingest any government textbook PDF into Ananta using Gemini Multimodal document parsing.\n• Automatically extracts concept hierarchy, misconception catalogs, and Socratic hints.\n• Multi-subject scaling: Physics, Chemistry, Biology, and English Reading Comprehension."),
    ("Phase 3: Low-Bandwidth Edge Caching (Q4 2027)",
     "• Offline lesson caching for rural schools with intermittent connectivity.\n• Edge-accelerated audio synthesis on low-cost Android tablets.\n• Asynchronous sync of parent progress ledgers when Wi-Fi becomes available.")
]

for idx, (title, desc) in enumerate(roadmap):
    y = Inches(1.6 + idx * 1.25)
    add_card(s13, Inches(0.5), y, Inches(9.0), Inches(1.15), CARD_BG, GOOGLE_BLUE)
    tb = s13.shapes.add_textbox(Inches(0.7), y + Inches(0.08), Inches(8.6), Inches(1.0))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.name = 'Google Sans'
    p.font.size = Pt(11.5)
    p.font.bold = True
    p.font.color.rgb = GOOGLE_BLUE
    
    p2 = tf.add_paragraph()
    p2.text = desc
    p2.font.name = 'Google Sans'
    p2.font.size = Pt(8.5)
    p2.font.color.rgb = TEXT_PRIMARY

# ==============================================================================
# SLIDE 14: SUBMISSION LINKS & EVALUATOR GUIDE
# ==============================================================================
s14 = prs.slides[13]
clear_body_shapes(s14)
set_slide_title(s14, "Official Submission & Demonstration Links",
                "Everything required to evaluate, test, and verify Ananta in under 3 minutes")

links = [
    ("🚀 Live Product on Cloud Run", "https://ananta-ivczdbgbja-as.a.run.app/", "Zero sign-in required. Select 'Leo (Simulated)' -> Grade 4 Math -> 'Start Lesson' to experience the live Socratic voice loop."),
    ("💻 Public GitHub Repository", "https://github.com/sur2rock1/AI_Builder_cup_2026.git", "Complete TypeScript codebase, deterministic plan compiler, BKT engine, evaluation harness, Dockerfile, and deployment scripts."),
    ("🎬 3:35 Video Demonstration", "[Submitted in Portal]", "Timed demo walking through Leo's misconception interception, the dynamic SVG blackboard, and the parent evidence ledger."),
    ("📊 Reproducible Benchmarks", "npm run eval:diagnosis", "Execute our 45-case ground-truth test suite directly from the command line to reproduce 100% recall and 3.15s latency numbers.")
]

for idx, (title, url, note) in enumerate(links):
    col = idx % 2
    row = idx // 2
    x = Inches(0.5 + col * 4.6)
    y = Inches(1.6 + row * 1.85)
    w = Inches(4.4)
    h = Inches(1.7)
    add_card(s14, x, y, w, h, CARD_BG, GOOGLE_GREEN)
    
    tb = s14.shapes.add_textbox(x + Inches(0.15), y + Inches(0.12), w - Inches(0.3), h - Inches(0.24))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.name = 'Google Sans'
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = GOOGLE_GREEN
    
    p_url = tf.add_paragraph()
    p_url.text = url
    p_url.font.name = 'Google Sans'
    p_url.font.size = Pt(9.5)
    p_url.font.bold = True
    p_url.font.color.rgb = GOOGLE_BLUE
    
    p2 = tf.add_paragraph()
    p2.text = note
    p2.font.name = 'Google Sans'
    p2.font.size = Pt(8.5)
    p2.font.color.rgb = TEXT_PRIMARY

# ==============================================================================
# SLIDE 15: ALIGNMENT WITH JUDGING CRITERIA
# ==============================================================================
s15 = prs.slides[14]
clear_body_shapes(s15)
set_slide_title(s15, "Alignment with AI Builder Cup Judging Criteria",
                "Direct evidence addressing each scoring dimension for the $10,000 Grand Prize")

criteria = [
    ("Technical Innovation (30%)",
     "• First architecture combining Gemini Live bidirectional audio streaming with real-time SVG function-calling.\n• Gemini 2.5 Flash reasoning diagnosis under a strict 6.5s SLA (p50: 3.15s).\n• Formal Bayesian Knowledge Tracing paired with a deterministic plan compiler."),
    ("Impact & Market Potential (25%)",
     "• Solves Bloom's 2-Sigma 1:1 tutoring problem for 250M+ students across APAC.\n• Fixes the 'Correct Answer Trap' where guesswork passes as learning in the $287B EdTech market.\n• Replaces coarse grades with transparent, verbatim evidence for parents."),
    ("Feasibility & Execution (25%)",
     "• 100% operational production prototype running live on Google Cloud Run.\n• $0.07/session unit economics and 88% gross margin.\n• Full compliance with COPPA/FERPA (zero persistent audio, stateless container)."),
    ("Presentation & Clarity (20%)",
     "• Live interactive deployment with zero sign-in barrier for judges.\n• Empirical EV-01 evaluation report with honest Wilson 95% confidence intervals.\n• Comprehensive documentation, video teleprompter script, and open-source repo.")
]

for idx, (title, desc) in enumerate(criteria):
    col = idx % 2
    row = idx // 2
    x = Inches(0.5 + col * 4.6)
    y = Inches(1.6 + row * 1.85)
    w = Inches(4.4)
    h = Inches(1.7)
    add_card(s15, x, y, w, h, CARD_BG, GOOGLE_BLUE)
    
    tb = s15.shapes.add_textbox(x + Inches(0.15), y + Inches(0.12), w - Inches(0.3), h - Inches(0.24))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.name = 'Google Sans'
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = GOOGLE_BLUE
    
    p2 = tf.add_paragraph()
    p2.text = desc
    p2.font.name = 'Google Sans'
    p2.font.size = Pt(8.5)
    p2.font.color.rgb = TEXT_PRIMARY

# ==============================================================================
# SLIDE 16: CONCLUSION / CLOSING
# ==============================================================================
# Slide 16 has the official Google Cloud AI Builder Cup closing graphic. We add an overlay text box.
s16 = prs.slides[15]
tb16 = s16.shapes.add_textbox(Inches(0.8), Inches(1.8), Inches(7.5), Inches(2.2))
tf16 = tb16.text_frame
tf16.word_wrap = True

p0 = tf16.paragraphs[0]
p0.text = "ANANTA"
p0.font.name = 'Google Sans'
p0.font.size = Pt(36)
p0.font.bold = True
p0.font.color.rgb = GOOGLE_BLUE

p1 = tf16.add_paragraph()
p1.text = "Every Question Opens Infinity."
p1.font.name = 'Google Sans'
p1.font.size = Pt(18)
p1.font.bold = True
p1.font.color.rgb = TEXT_PRIMARY

p2 = tf16.add_paragraph()
p2.text = "\nA tutor that doesn't just grade a child's answers, but understands how they think.\nBuilt for Google Cloud AI Builder Cup 2026."
p2.font.name = 'Google Sans'
p2.font.size = Pt(12)
p2.font.color.rgb = TEXT_MUTED

prs.save(OUTPUT_PPTX)
print(f"Successfully generated winning presentation deck: {OUTPUT_PPTX}")
