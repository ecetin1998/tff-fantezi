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
TARGET={"şut":"shots","orta":"crosses","çalım":"takeons"}

def stat_kind(title):
    if "yarat" in title: return "key_passes"
    return TARGET.get(title)

def norm(s):
    return re.sub(r"\s+"," ",s or "").strip().casefold()

def number(s):
    m=re.search(r"-?\d+(?:[.,]\d+)?",s or "")
    return float(m.group(0).replace(",",".")) if m else None

def fetch(url):
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0"})
    with urllib.request.urlopen(req,timeout=30) as r:return r.read().decode("utf-8","ignore")


def resolve_nuxt(raw):
    cache={}; resolving=set()
    def R(x):
        if not isinstance(x,int): return x
        if x<0 or x>=len(raw): return None
        if x in cache:return cache[x]
        if x in resolving:return None
        resolving.add(x); v=raw[x]
        if isinstance(v,dict):
            out={}; cache[x]=out
            for k,z in v.items():out[k]=R(z)
        elif isinstance(v,list):
            out=[]; cache[x]=out
            for z in v:out.append(R(z))
        else:out=v
        resolving.discard(x);return out
    return R

def parse(url,html):
    soup=BeautifulSoup(html,"html.parser"); script=soup.find("script",id="__NUXT_DATA__")
    if not script or not script.string: raise RuntimeError("NUXT data missing: "+url)
    raw=json.loads(script.string); R=resolve_nuxt(raw); out=[]; seen=set()
    mapping={"shots":"shots","chances_created":"key_passes","crosses":"crosses","takeons":"takeons"}
    for v in raw:
        if not isinstance(v,dict) or "type" not in v or "players" not in v:continue
        typ=R(v["type"])
        if typ not in mapping:continue
        players=R(v["players"])
        if not isinstance(players,list):continue
        for item in players:
            if not isinstance(item,dict):continue
            p=item.get("player") or {}
            name=str(p.get("name") or p.get("match_name") or "").strip() if isinstance(p,dict) else ""
            if not name:continue
            team_id=item.get("team_id"); key=(typ,name,team_id)
            if key in seen:continue
            seen.add(key)
            x={"source_url":url,"stat":mapping[typ],"player_name":name,"team_name":"","source_team_id":team_id}
            if typ=="shots":
                x["shots"]=int(item.get("total") or 0); x["shots_on_target"]=int(item.get("target") or 0)
            elif typ=="chances_created": x["key_passes"]=int(item.get("total") or 0)
            elif typ=="crosses":
                x["crosses"]=int(item.get("total") or 0); x["successful_crosses"]=int(item.get("success") or 0)
            elif typ=="takeons":
                x["takeons"]=int(item.get("total") or 0); x["successful_takeons"]=int(item.get("success") or 0)
            out.append(x)
    return out

def main():
    rows=[]
    for u in URLS:
        html=fetch(u); parsed=parse(u,html); rows.extend(parsed)
        print(f"SOURCE {u} rows={len(parsed)}",file=sys.stderr)
    agg={}
    for r in rows:
        k=(norm(r["player_name"]),str(r.get("source_team_id") or r.get("team_name") or ""))
        if k not in agg:
            agg[k]={"player_name":r["player_name"],"team_name":r.get("team_name") or "","shots":0,"shots_on_target":0,"key_passes":0,"crosses":0,"successful_crosses":0,"takeons":0,"successful_takeons":0,"source_matches":0}
        x=agg[k]
        if r.get("team_name"): x["team_name"]=r["team_name"]
        x["source_matches"]=max(x["source_matches"],1)
        for field in ["shots","shots_on_target","key_passes","crosses","successful_crosses","takeons","successful_takeons"]:
            if r.get(field) is not None:x[field]+=int(r[field])
    rows=list(agg.values())
    bad=[x for x in rows if x["shots"]>20 or x["shots_on_target"]>x["shots"] or x["successful_crosses"]>x["crosses"] or x["successful_takeons"]>x["takeons"]]
    if bad: raise RuntimeError("advanced stat sanity failure: "+json.dumps(bad[:10],ensure_ascii=False))
    print(json.dumps({"gameweek":6,"rows":rows},ensure_ascii=False,separators=(",",":")))
if __name__=="__main__": main()
