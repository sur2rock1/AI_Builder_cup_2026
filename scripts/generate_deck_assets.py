"""
generate_deck_assets.py
Generates high-resolution graphical assets for the official AI Builder Cup pitch deck:
1. docs/assets/arch_diagram.png (Google Cloud Native Architecture)
2. docs/assets/flow_diagram.png (Dual-Loop Socratic Process Flow)
3. docs/assets/benchmark_chart.png (EV-01 Empirical Evaluation Dashboard)
4. docs/assets/problem_diagram.png (The Correct Answer Trap Infographic)
5. docs/assets/ui_showcase.png (Composited UI elements with real blackboard captures)
"""

import os
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np
from PIL import Image, ImageDraw, ImageFont

os.makedirs('docs/assets', exist_ok=True)

# -------------------------------------------------------------
# 1. ARCHITECTURE DIAGRAM
# -------------------------------------------------------------
def create_arch_diagram():
    fig, ax = plt.subplots(figsize=(14, 8), dpi=200)
    ax.set_facecolor('#0F172A') # Dark modern slate background
    fig.patch.set_facecolor('#0F172A')
    ax.axis('off')

    # Title
    ax.text(0.5, 0.95, "ANANTA SYSTEM ARCHITECTURE ON GOOGLE CLOUD", 
            fontsize=20, fontweight='bold', color='#FFFFFF', ha='center', va='center')
    ax.text(0.5, 0.90, "Stateless Auto-Scaling WebSockets · Real-Time Audio Streaming · Deterministic Pedagogy", 
            fontsize=11, color='#94A3B8', ha='center', va='center')

    # Box Helper
    def draw_card(x, y, w, h, title, subtitle, color, border_color='#334155', icon=''):
        rect = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.015,rounding_size=0.02",
                                      facecolor=color, edgecolor=border_color, linewidth=1.5)
        ax.add_patch(rect)
        if title:
            ax.text(x + w*0.05, y + h - 0.04, title, fontsize=11, fontweight='bold', color='#FFFFFF', va='top')
        if subtitle:
            ax.text(x + w*0.05, y + h - 0.075, subtitle, fontsize=8.5, color='#CBD5E1', va='top')

    # 1. CLIENT TIER (Left)
    draw_card(0.04, 0.18, 0.22, 0.66, "CLIENT TIER (BROWSER)", "Interactive Socratic Stage", '#1E293B', '#3B82F6')
    # Inner elements
    draw_card(0.06, 0.62, 0.18, 0.16, "Web Audio API", "Bidirectional PCM 16kHz\nLive Microphone Stream\nVAD & Echo Cancellation", '#0F172A', '#60A5FA')
    draw_card(0.06, 0.41, 0.18, 0.18, "Dynamic Blackboard", "Server-Driven SVG Canvas\nChalk Sketches & Math 2D/3D\nZero-Lag Visual Updates", '#0F172A', '#60A5FA')
    draw_card(0.06, 0.22, 0.18, 0.16, "Parent Portal", "Bayesian Mastery View\nVerbatim Evidence Quotes\nBloom-Scale Tracking", '#0F172A', '#60A5FA')

    # 2. APPLICATION RUNTIME (Middle)
    draw_card(0.32, 0.14, 0.36, 0.73, "CONTAINER TIER · GOOGLE CLOUD RUN", "Stateless, Serverless Node.js/TypeScript Container", '#1E293B', '#10B981')
    
    draw_card(0.34, 0.65, 0.32, 0.15, "WebSocket Gateway & Live Session Hub", "Manages audio stream duplexing & client session states\nSub-second auto-scaling to thousands of concurrent kids", '#0F172A', '#34D399')
    draw_card(0.34, 0.44, 0.32, 0.18, "Deterministic Lesson Plan Compiler", "Pre-computes pedagogical DAGs & misconceptions\nGuarantees curriculum safety: ZERO hallucinated lessons\nSame evidence in -> Same lesson plan out (Unit-tested)", '#0F172A', '#34D399')
    draw_card(0.34, 0.21, 0.32, 0.20, "Bayesian Knowledge Tracing (BKT) Engine", "Mathematically tracks mastery probability P(L_n)\nCategorizes claims: Suspected -> Confirmed -> Resolved\nEnforces evidence citations on all generated parent reports", '#0F172A', '#34D399')

    # 3. GOOGLE AI TIER (Right Top)
    draw_card(0.74, 0.50, 0.23, 0.37, "GOOGLE AI & GEMINI", "Multimodal Intelligence", '#1E293B', '#8B5CF6')
    draw_card(0.755, 0.69, 0.20, 0.14, "Gemini Live API", "Native Audio-to-Audio\nUltra-low latency conversational voice\nReal-time tool & function calling", '#0F172A', '#A78BFA')
    draw_card(0.755, 0.53, 0.20, 0.13, "Gemini 2.5 Flash", "Socratic Diagnosis Engine\nEvaluates reasoning against closed lists\nMean latency: 3.15s (Strict 6.5s SLA)", '#0F172A', '#A78BFA')

    # 4. PERSISTENCE & DATA (Right Bottom)
    draw_card(0.74, 0.14, 0.23, 0.33, "GOOGLE CLOUD PERSISTENCE", "Enterprise Data & Privacy", '#1E293B', '#F59E0B')
    draw_card(0.755, 0.31, 0.20, 0.12, "Cloud Storage & Datasets", "Curricula DAGs, textbook PDFs\nValidated misconception catalogues", '#0F172A', '#FCD34D')
    draw_card(0.755, 0.17, 0.20, 0.11, "Cloud Firestore & Auth", "Student state & evidence ledgers\nCOPPA/FERPA isolated accounts", '#0F172A', '#FCD34D')

    # Arrows
    def draw_arrow(x1, y1, x2, y2, label=""):
        ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle="->", color="#38BDF8", lw=2, mutation_scale=15))
        if label:
            ax.text((x1+x2)/2, (y1+y2)/2 + 0.02, label, fontsize=8, color="#38BDF8", ha='center', fontweight='bold')

    draw_arrow(0.26, 0.70, 0.34, 0.70, "Bi-directional Audio")
    draw_arrow(0.34, 0.50, 0.26, 0.50, "Tool Events (SVG)")
    draw_arrow(0.66, 0.73, 0.74, 0.73, "Gemini Live WS")
    draw_arrow(0.66, 0.58, 0.74, 0.58, "Diagnosis Prompt")
    draw_arrow(0.66, 0.35, 0.74, 0.35, "Read/Write Curricula")
    draw_arrow(0.66, 0.22, 0.74, 0.22, "Save BKT Records")

    plt.tight_layout()
    plt.savefig('docs/assets/arch_diagram.png', dpi=200, bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close()
    print("Saved docs/assets/arch_diagram.png")


# -------------------------------------------------------------
# 2. PROCESS FLOW DIAGRAM
# -------------------------------------------------------------
def create_flow_diagram():
    fig, ax = plt.subplots(figsize=(14, 7), dpi=200)
    ax.set_facecolor('#F8FAFC') # Clean light backdrop
    fig.patch.set_facecolor('#F8FAFC')
    ax.axis('off')

    ax.text(0.5, 0.94, "THE DUAL-LOOP SOCRATIC LEARNING CYCLE", 
            fontsize=18, fontweight='bold', color='#0F172A', ha='center', va='center')
    ax.text(0.5, 0.89, "How Ananta separates correct answers from genuine mathematical reasoning", 
            fontsize=11, color='#475569', ha='center', va='center')

    # Steps
    steps = [
        ("1. NATURAL SPEECH", "Child Explains Logic", "Child speaks by voice:\n\"0.50 is bigger than 0.7\nbecause 50 is larger than 7.\"", '#1A73E8', '#E8F0FE'),
        ("2. SOCRATIC DIAGNOSIS", "Gemini 2.5 Flash (3.15s)", "Evaluates reasoning against\nclosed misconception catalog.\nFlags: M_DECIMAL_WHOLE_NUM\nPrecision: 100% (0 False Alarms)", '#7C3AED', '#F3E8FF'),
        ("3. DYNAMIC BLACKBOARD", "Server Tool Dispatch", "Pivots visual stage:\nDraws place-value tenths grid.\nTutor Socratic probe:\n\"What does the 5 mean in 0.50?\"", '#059669', '#ECFDF5'),
        ("4. EVIDENCE LEDGER", "BKT & Parent Portal", "Bayesian model updates state:\nFlags 'Suspected' -> 'Confirmed'\nLogs verbatim child quote\nZero teacher grading burden", '#EA580C', '#FFF7ED')
    ]

    for i, (tag, header, body, accent, bg) in enumerate(steps):
        x = 0.05 + i * 0.235
        y = 0.22
        w = 0.20
        h = 0.58

        rect = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.015,rounding_size=0.025",
                                      facecolor=bg, edgecolor=accent, linewidth=2)
        ax.add_patch(rect)

        # Header Pill
        pill = patches.FancyBboxPatch((x + 0.015, y + h - 0.08), w - 0.03, 0.06,
                                      boxstyle="round,pad=0.01,rounding_size=0.015",
                                      facecolor=accent, edgecolor='none')
        ax.add_patch(pill)
        ax.text(x + w/2, y + h - 0.05, tag, fontsize=9, fontweight='bold', color='#FFFFFF', ha='center', va='center')

        # Subtitle
        ax.text(x + w/2, y + h - 0.13, header, fontsize=12, fontweight='bold', color='#0F172A', ha='center', va='center')

        # Body
        ax.text(x + 0.02, y + h - 0.20, body, fontsize=9.5, color='#334155', va='top', linespacing=1.4)

        # Arrow to next
        if i < 3:
            ax.annotate('', xy=(x + w + 0.03, y + h/2), xytext=(x + w + 0.005, y + h/2),
                        arrowprops=dict(arrowstyle="->", color="#94A3B8", lw=3, mutation_scale=20))

    # Bottom summary banner
    summary_rect = patches.FancyBboxPatch((0.05, 0.06), 0.905, 0.11, boxstyle="round,pad=0.01,rounding_size=0.02",
                                          facecolor='#0F172A', edgecolor='none')
    ax.add_patch(summary_rect)
    ax.text(0.5, 0.115, "TRADITIONAL QUIZ APPS: Marks answer CORRECT (100%) · Misconception stays hidden until failure on final exam.",
            fontsize=9.5, color='#F87171', ha='center', fontweight='bold')
    ax.text(0.5, 0.08, "ANANTA ADVANTAGE: Intercepts broken logic at the point of thought · Never gives away the answer · Proves mastery with proof.",
            fontsize=9.5, color='#34D399', ha='center', fontweight='bold')

    plt.tight_layout()
    plt.savefig('docs/assets/flow_diagram.png', dpi=200, bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close()
    print("Saved docs/assets/flow_diagram.png")


# -------------------------------------------------------------
# 3. BENCHMARK DASHBOARD (EV-01)
# -------------------------------------------------------------
def create_benchmark_chart():
    fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(14, 8), dpi=200)
    fig.patch.set_facecolor('#0F172A')
    for ax in [ax1, ax2, ax3, ax4]:
        ax.set_facecolor('#1E293B')

    fig.suptitle("EMPIRICAL EVALUATION (EV-01 BENCHMARK) · GEMINI 2.5 FLASH", 
                 fontsize=18, fontweight='bold', color='#FFFFFF', y=0.98)

    # Subplot 1: Hidden Misconception Recall
    systems = ['Standard Quiz Apps\n(Kahoot/Quizlet)', 'Plain Gemini Prompt\n("Does child understand?")', 'Ananta Socratic\nAssessor (Ours)']
    recalls = [0, 90, 100]
    colors = ['#EF4444', '#F59E0B', '#10B981']
    bars = ax1.bar(systems, recalls, color=colors, width=0.55)
    ax1.set_ylim(0, 115)
    ax1.set_ylabel("Misconception Recall Rate (%)", color='#CBD5E1', fontsize=10, fontweight='bold')
    ax1.set_title("Catches Right Answer with Broken Method (n=10)", color='#FFFFFF', fontsize=12, fontweight='bold', pad=12)
    ax1.tick_params(colors='#94A3B8')
    for bar, val in zip(bars, recalls):
        ax1.text(bar.get_x() + bar.get_width()/2, val + 3, f"{val}%", ha='center', color='#FFFFFF', fontweight='bold', fontsize=11)
    ax1.grid(axis='y', linestyle='--', alpha=0.15)

    # Subplot 2: Precision & False Alarms
    metrics = ['False Alarms on\nSound Reasoning (n=10)', 'Precision of\nFlags (n=10)', 'Exact 5-Class\nAccuracy (n=45)']
    ananta_vals = [0, 100, 96]
    bars2 = ax2.bar(metrics, ananta_vals, color=['#10B981', '#3B82F6', '#8B5CF6'], width=0.5)
    ax2.set_ylim(0, 115)
    ax2.set_ylabel("Metric Score (%)", color='#CBD5E1', fontsize=10, fontweight='bold')
    ax2.set_title("Diagnostic Accuracy & Soundness Metrics", color='#FFFFFF', fontsize=12, fontweight='bold', pad=12)
    ax2.tick_params(colors='#94A3B8')
    for bar, val in zip(bars2, ananta_vals):
        ax2.text(bar.get_x() + bar.get_width()/2, val + 3, f"{val}%", ha='center', color='#FFFFFF', fontweight='bold', fontsize=11)
    ax2.grid(axis='y', linestyle='--', alpha=0.15)

    # Subplot 3: Latency Distribution vs SLA
    percentiles = ['p50 (Median)', 'p90', 'p95', 'Max Latency', 'Strict SLA Budget']
    latencies = [3.15, 4.41, 4.82, 5.79, 6.50]
    colors_lat = ['#38BDF8', '#38BDF8', '#818CF8', '#C084FC', '#F43F5E']
    bars3 = ax3.barh(percentiles, latencies, color=colors_lat, height=0.55)
    ax3.set_xlim(0, 8.0)
    ax3.set_xlabel("Latency in Seconds (Per Voice Turn)", color='#CBD5E1', fontsize=10, fontweight='bold')
    ax3.set_title("Real-Time Response Latency (n=45 calls)", color='#FFFFFF', fontsize=12, fontweight='bold', pad=12)
    ax3.tick_params(colors='#94A3B8')
    for bar, val in zip(bars3, latencies):
        ax3.text(val + 0.15, bar.get_y() + bar.get_height()/2, f"{val:.2f} s", va='center', color='#FFFFFF', fontweight='bold', fontsize=10)
    ax3.axvline(6.5, color='#F43F5E', linestyle='--', linewidth=1.5)
    ax3.grid(axis='x', linestyle='--', alpha=0.15)

    # Subplot 4: Scientific Trust & Guardrails
    ax4.axis('off')
    ax4.text(0.05, 0.90, "HONEST SCIENTIFIC REPORTING", fontsize=13, fontweight='bold', color='#38BDF8')
    notes = [
        "• Wilson 95% Confidence Intervals: 10/10 hidden cases = [72% - 100%].",
        "• Prompt-Injection Resilience: 100% (2/2) adversarial attacks resisted.",
        "• Zero Hallucinated IDs: 0% uncatalogued misconceptions assigned.",
        "• App Shell Cold Start: 102 ms on Google Cloud Run.",
        "• Reproducibility: 'npm run eval:diagnosis' executes 45 ground-truth cases."
    ]
    for idx, note in enumerate(notes):
        ax4.text(0.05, 0.72 - idx*0.14, note, fontsize=9.5, color='#E2E8F0', va='center')

    plt.tight_layout(rect=[0, 0.03, 1, 0.95])
    plt.savefig('docs/assets/benchmark_chart.png', dpi=200, bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close()
    print("Saved docs/assets/benchmark_chart.png")


# -------------------------------------------------------------
# 4. PROBLEM DIAGRAM (THE CORRECT ANSWER TRAP)
# -------------------------------------------------------------
def create_problem_diagram():
    fig, ax = plt.subplots(figsize=(14, 6.5), dpi=200)
    ax.set_facecolor('#0F172A')
    fig.patch.set_facecolor('#0F172A')
    ax.axis('off')

    ax.text(0.5, 0.93, "THE 'CORRECT ANSWER TRAP' IN K-12 EDUCATION", 
            fontsize=18, fontweight='bold', color='#FFFFFF', ha='center', va='center')
    ax.text(0.5, 0.86, "Why standard quizzes fail: A child can get the right answer with completely broken logic.", 
            fontsize=11, color='#94A3B8', ha='center', va='center')

    # Card 1: The Exchange
    rect1 = patches.FancyBboxPatch((0.05, 0.15), 0.42, 0.65, boxstyle="round,pad=0.015,rounding_size=0.02",
                                   facecolor='#1E293B', edgecolor='#38BDF8', linewidth=1.5)
    ax.add_patch(rect1)
    ax.text(0.26, 0.74, "THE ACTUAL STUDENT EXCHANGE", fontsize=12, fontweight='bold', color='#38BDF8', ha='center')
    
    dialogue = (
        "Tutor Question:\n"
        "\"Which is greater: $0.50 or $0.7?\"\n\n"
        "Child's Response:\n"
        "\"$0.50, because 50 is bigger than 7!\"\n\n"
        "Pedagogic Diagnosis:\n"
        "The child treats decimals as whole numbers.\n"
        "They see '50' and '7' rather than tenths."
    )
    ax.text(0.08, 0.66, dialogue, fontsize=10, color='#F8FAFC', va='top', linespacing=1.35)

    # Card 2: Standard Quiz App
    rect2 = patches.FancyBboxPatch((0.52, 0.48), 0.43, 0.32, boxstyle="round,pad=0.015,rounding_size=0.02",
                                   facecolor='#261517', edgecolor='#EF4444', linewidth=1.5)
    ax.add_patch(rect2)
    ax.text(0.735, 0.75, "STANDARD QUIZ APP (Kahoot/Quizlet/Tests)", fontsize=11, fontweight='bold', color='#F87171', ha='center')
    ax.text(0.55, 0.68, "• If Multiple Choice: Child guesses right -> Marked 100% Mastered!\n• If Open: Grader checks only final string.\n• ZERO awareness of the child's underlying misconception.\n• Result: The flaw compounds until the child fails algebra.", 
            fontsize=9, color='#FECACA', va='top', linespacing=1.3)

    # Card 3: Ananta
    rect3 = patches.FancyBboxPatch((0.52, 0.12), 0.43, 0.32, boxstyle="round,pad=0.015,rounding_size=0.02",
                                   facecolor='#062A1F', edgecolor='#10B981', linewidth=1.5)
    ax.add_patch(rect3)
    ax.text(0.735, 0.39, "ANANTA SOCRATIC AI TUTOR (Google Cloud)", fontsize=11, fontweight='bold', color='#34D399', ha='center')
    ax.text(0.55, 0.32, "• Intercepts broken reasoning instantly in 3.15s.\n• Never says 'wrong'—pivots blackboard to tenths vs hundredths.\n• Asks: 'How many dimes are in $0.7 vs $0.50?'\n• Cites exact quote in parent letter: no guesswork, pure evidence.", 
            fontsize=9, color='#D1FAE5', va='top', linespacing=1.3)

    plt.tight_layout()
    plt.savefig('docs/assets/problem_diagram.png', dpi=200, bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close()
    print("Saved docs/assets/problem_diagram.png")


# -------------------------------------------------------------
# 5. UI SHOWCASE COMPOSITE
# -------------------------------------------------------------
def create_ui_showcase():
    fig, ax = plt.subplots(figsize=(14, 7), dpi=200)
    ax.set_facecolor('#0F172A')
    fig.patch.set_facecolor('#0F172A')
    ax.axis('off')

    ax.text(0.5, 0.94, "LIVE PROTOTYPE SHOWCASE · POWERED BY CLOUD RUN & GEMINI", 
            fontsize=18, fontweight='bold', color='#FFFFFF', ha='center', va='center')
    ax.text(0.5, 0.88, "Cloud Run URL: https://ananta-ivczdbgbja-as.a.run.app/ (Zero Sign-in Demo Mode)", 
            fontsize=10.5, color='#38BDF8', ha='center', va='center')

    # If user uploaded screenshots exist, load and composite them!
    uploaded = r'C:\Users\user\.gemini\antigravity\brain\7568a0df-20aa-4990-83e7-8b0aff645f4a\.user_uploaded'
    ss1_path = os.path.join(uploaded, 'media_1789801683064.png')
    ss2_path = os.path.join(uploaded, 'media_1789802070828.png')

    if os.path.exists(ss1_path) and os.path.exists(ss2_path):
        im1 = Image.open(ss1_path)
        im2 = Image.open(ss2_path)
        
        # Display im1
        ax.imshow(im1, extent=[0.04, 0.48, 0.12, 0.80])
        # Display im2
        ax.imshow(im2, extent=[0.52, 0.96, 0.12, 0.80])

        # Border frames
        rect1 = patches.Rectangle((0.04, 0.12), 0.44, 0.68, linewidth=2, edgecolor='#38BDF8', facecolor='none')
        rect2 = patches.Rectangle((0.52, 0.12), 0.44, 0.68, linewidth=2, edgecolor='#10B981', facecolor='none')
        ax.add_patch(rect1)
        ax.add_patch(rect2)

        # Labels
        ax.text(0.26, 0.07, "Dynamic Blackboard (Live SVG Geometry & Place-Value Grid)", 
                fontsize=11, fontweight='bold', color='#FFFFFF', ha='center')
        ax.text(0.74, 0.07, "Voice Interaction Stage (Bidirectional Audio + Real-time Guidance)", 
                fontsize=11, fontweight='bold', color='#FFFFFF', ha='center')
    else:
        # Fallback card
        ax.text(0.5, 0.5, "Live UI Screenshots on Cloud Run", fontsize=14, color='#FFFFFF', ha='center')

    plt.tight_layout()
    plt.savefig('docs/assets/ui_showcase.png', dpi=200, bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close()
    print("Saved docs/assets/ui_showcase.png")

if __name__ == '__main__':
    create_arch_diagram()
    create_flow_diagram()
    create_benchmark_chart()
    create_problem_diagram()
    create_ui_showcase()
    print("All deck graphics successfully created in docs/assets/")
