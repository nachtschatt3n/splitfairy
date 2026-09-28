import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

TEAL, CREAM, CORAL = "#153f40", "#f5e8ca", "#e58465"
def P(x,y): return f"{x:.2f} {y:.2f}".replace(".00","")
def mid(a,b): return ((a[0]+b[0])/2,(a[1]+b[1])/2)

def sparkle(d=17, g=7, reach=108, c=128):
    """Four-point sparkle, cut along the anti-diagonal into two identical halves (180° rotation),
    each half pushed g units out along the diagonal. d = how far the concave control points sit
    from the centre (bigger = fuller body)."""
    T,R,B,L=(c,c-reach),(c+reach,c),(c,c+reach),(c-reach,c)
    def split(p0,k,p2):
        q0,q1=mid(p0,k),mid(k,p2); return q0,mid(q0,q1),q1
    a1,m1,b1=split(T,(c+d,c-d),R)
    a2,m2,b2=split(B,(c-d,c+d),L)
    h1=(f"M{P(T[0]-g,T[1]-g)}Q{P(a1[0]-g,a1[1]-g)} {P(m1[0]-g,m1[1]-g)}L{P(m2[0]-g,m2[1]-g)}"
        f"Q{P(b2[0]-g,b2[1]-g)} {P(L[0]-g,L[1]-g)}Q{P(c-d-g,c-d-g)} {P(T[0]-g,T[1]-g)}Z")
    h2=(f"M{P(m1[0]+g,m1[1]+g)}Q{P(b1[0]+g,b1[1]+g)} {P(R[0]+g,R[1]+g)}Q{P(c+d+g,c+d+g)} {P(B[0]+g,B[1]+g)}"
        f"Q{P(a2[0]+g,a2[1]+g)} {P(m2[0]+g,m2[1]+g)}Z")
    return h1+h2

def svg(body, w=256, h=256, title="Splitfairy logo"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" role="img">'
            f'<title>{title}</title>{body}</svg>\n')

# --- wordmark: "split" Outfit Bold + "fairy" Outfit Regular, shaped with kerning, outlined ---
fonts={w:(TTFont(f"fonts/outfit-{w}.ttf"), hb.Font(hb.Face(hb.Blob.from_file_path(f"fonts/outfit-{w}.ttf")))) for w in (400,700)}
TRACK=-0.045  # em, like the app header's tight tracking
def run(text, weight, size, x, baseline, pen_paths, bounds):
    tt,hbf=fonts[weight]; buf=hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(hbf,buf,{"kern":True,"liga":False})
    gs=tt.getGlyphSet(); order=tt.getGlyphOrder(); s=size/1000
    for info,pos in zip(buf.glyph_infos,buf.glyph_positions):
        name=order[info.codepoint]
        sp=SVGPathPen(gs); tp=TransformPen(sp,(s,0,0,-s,x+pos.x_offset*s,baseline-pos.y_offset*s)); gs[name].draw(tp)
        pen_paths.append(sp.getCommands())
        bp=BoundsPen(gs); gs[name].draw(TransformPen(bp,(s,0,0,-s,x,baseline)))
        if bp.bounds: bounds.append(bp.bounds)
        x+=pos.x_advance*s+TRACK*size
    return x
def wordmark(size, x, baseline):
    paths,b=[],[]
    x=run("split",700,size,x,baseline,paths,b)
    x=run("fairy",400,size,x+0.075*size,baseline,paths,b)
    xs=[q[0] for q in b]+[q[2] for q in b]; ys=[q[1] for q in b]+[q[3] for q in b]
    return "".join(paths),(min(xs),min(ys),max(xs),max(ys))

MAIN=sparkle()            # d=17, g=7
SMALL=sparkle(d=24,g=11,reach=112)  # ≤32 px: fuller body, wider cut
REV=sparkle(g=8)          # light-on-dark: cut opened slightly so it doesn't fill in

def write(name, s): open(f"kit/{name}.svg","w").write(s)
write("splitfairy-symbol", svg(f'<path fill="{TEAL}" d="{MAIN}"/>'))
write("splitfairy-symbol-black", svg(f'<path d="{MAIN}"/>'))
write("splitfairy-symbol-small", svg(f'<path fill="{TEAL}" d="{SMALL}"/>', title="Splitfairy logo (small sizes)"))
write("splitfairy-symbol-reversed", svg(f'<path fill="{CREAM}" d="{REV}"/>', title="Splitfairy logo (on dark)"))

# horizontal lockup: symbol full height, wordmark x-height centred on the symbol
SIZE=150; xh=486*SIZE/1000; base=128+xh/2
wm,(x0,y0,x1,y1)=wordmark(SIZE,0,base)
gap=62-x0   # space ≈ one-quarter of the symbol height, measured from the symbol's visible edge (243)
W=243+gap+x1+13
tx=243+gap
def horiz(fill_sym, fill_txt, sym=MAIN):
    return svg(f'<path fill="{fill_sym}" d="{sym}"/><path fill="{fill_txt}" transform="translate({tx:.2f} 0)" d="{wm}"/>',W,256)
write("splitfairy-horizontal", horiz(TEAL,TEAL))
write("splitfairy-horizontal-reversed", horiz(CREAM,CREAM,REV))

# wordmark only
wm2,(a,b,c,d)=wordmark(SIZE,0,0)
pad=13
write("splitfairy-wordmark", svg(f'<path fill="{TEAL}" transform="translate({pad-a:.2f} {pad-b:.2f})" d="{wm2}"/>',c-a+2*pad,d-b+2*pad))

# stacked: symbol on top, wordmark centred below
SW=c-a; SH=d-b; top_gap=40
Wst=max(256,SW+2*pad); sx=(Wst-256)/2; Hst=13+230+top_gap+SH+pad
write("splitfairy-stacked", svg(
    f'<path fill="{TEAL}" transform="translate({sx:.2f} 0)" d="{MAIN}"/>'
    f'<path fill="{TEAL}" transform="translate({(Wst-SW)/2-a:.2f} {243+top_gap-b:.2f})" d="{wm2}"/>',Wst,Hst))
print("W",round(W),"stacked",round(Wst),round(Hst))

# favicon: rounded teal tile + cream small-size mark (readable on light and dark browser tabs)
open("kit/symbol/favicon.svg","w").write(svg(
    f'<rect width="256" height="256" rx="56" fill="{TEAL}"/>'
    f'<path fill="{CREAM}" transform="translate(128 128) scale(0.84) translate(-128 -128)" d="{SMALL}"/>',
    title="Splitfairy"))
