#!/usr/bin/env python3
import json,re,sys,urllib.request
from bs4 import BeautifulSoup

URLS=[
"https://www.sahadan.com/mac/trabzonspor-vs-galatasaray/chqb1auleskzta4x73zkpa978/istatistikler/oyuncu",
"https://www.sahadan.com/mac/kasimpasa-vs-konyaspor/ci1tne0t2bybeu35ux7zyshlg/istatistikler/oyuncu",
"https://www.sahadan.com/mac/basaksehir-vs-genclerbirligi/cid6senvy4thpyrx4c74q0lck/istatistikler/oyuncu",
"https://www.sahadan.com/mac/amed-sk-vs-besiktas/ciogj2i9n0vuzikm94orqsyz8/istatistikler/oyuncu",
"https://www.sahadan.com/mac/goztepe-vs-caykur-rizespor/cizsw1hg6g8wzusyinxuvtudw/istatistikler/oyuncu",
"https://www.sahadan.com/mac/corum-fk-vs-alanyaspor/cjb4iy9yti4b15ka3395yxjbo/istatistikler/oyuncu",
"https://www.sahadan.com/mac/fenerbahce-vs-eyupspor/cjmgsnh2mcm3fvksvmlyxu3h0/istatistikler/oyuncu",
"https://www.sahadan.com/mac/kocaelispor-vs-gaziantep-fk/cjxu8u3pt1koim3dig3pvv09g/istatistikler/oyuncu",
"https://www.sahadan.com/mac/erzurumspor-fk-vs-samsunspor/ck9d08o1wrut7snbkdo3ob8yc/istatistikler/oyuncu",
]
TARGET={"şut":"shots","yaratılan şans":"key_passes","orta":"crosses","çalım":"takeons"}

def norm(s):
    return re.sub(r"\s+"," ",s or "").strip().casefold()

def number(s):
    m=re.search(r"-?\d+(?:[.,]\d+)?",s or "")
    return float(m.group(0).replace(",",".")) if m else None

def fetch(url):
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0"})
    with urllib.request.urlopen(req,timeout=30) as r:return r.read().decode("utf-8","ignore")

def parse(url,html):
    soup=BeautifulSoup(html,"html.parser")
    out=[]; seen=set()
    for head in soup.find_all("div"):
        title=norm(head.get_text(" ",strip=True))
        if title not in TARGET: continue
        card=head
        for _ in range(6):
            if card is None: break
            classes=" ".join(card.get("class",[]))
            if "rounded-base" in classes: break
            card=card.parent
        if card is None: continue
        stat=TARGET[title]
        for a in card.select("a[title]"):
            row=a.parent
            if row is None: continue
            player=(a.get("title") or "").strip()
            spans=a.find_all("span")
            team=spans[-1].get_text(" ",strip=True) if len(spans)>1 else ""
            vals=[]
            for d in row.find_all("div",class_=lambda c:c and "text-center" in (c if isinstance(c,str) else " ".join(c)),recursive=False):
                v=number(d.get_text(" ",strip=True))
                if v is not None: vals.append(v)
            if not player or not vals: continue
            key=(stat,player,team)
            if key in seen: continue
            seen.add(key)
            item={"source_url":url,"stat":stat,"player_name":player,"team_name":team}
            if stat=="shots":
                item["shots"]=int(vals[-1]); item["shots_on_target"]=int(vals[0]) if len(vals)>1 else None
            elif stat=="key_passes":
                item["key_passes"]=int(vals[0])
            elif stat=="crosses":
                item["crosses"]=int(vals[-1]); item["successful_crosses"]=int(vals[0]) if len(vals)>1 else None
            elif stat=="takeons":
                item["takeons"]=int(vals[-1]); item["successful_takeons"]=int(vals[0]) if len(vals)>1 else None
            out.append(item)
    return out

def main():
    rows=[]
    for u in URLS:
        html=fetch(u); parsed=parse(u,html); rows.extend(parsed)
        print(f"SOURCE {u} rows={len(parsed)}",file=sys.stderr)
    agg={}
    for r in rows:
        k=(r["player_name"],r["team_name"])
        x=agg.setdefault(k,{"player_name":k[0],"team_name":k[1],"shots":0,"shots_on_target":0,"key_passes":0,"crosses":0,"successful_crosses":0,"takeons":0,"successful_takeons":0,"source_matches":0})
        x["source_matches"]+=1
        for f in ["shots","shots_on_target","key_passes","crosses","successful_crosses","takeons","successful_takeons"]:
            if r.get(f) is not None:x[f]+=int(r[f])
    print(json.dumps({"gameweek":6,"rows":list(agg.values())},ensure_ascii=False,separators=(",",":")))
if __name__=="__main__": main()
