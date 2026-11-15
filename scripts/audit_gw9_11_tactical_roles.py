#!/usr/bin/env python3
"""Read-only source-verified recent formation slots. Never infer a starter from minutes."""
import json, time, re
from pathlib import Path
from datetime import datetime, timezone
from audit_mh8_fotmob_sources import fetch_html
from probe_mh8_fotmob_structured import candidates, read_json
from audit_gw11_advanced_sources import verified_fixture
from audit_mh8_tactical_roles import explicit_role

BASE=Path("data/source-evidence")
def load(p): return json.loads((BASE/p).read_text())
def slots(team):
    starters=team.get("starters") or []
    formation=team.get("formation") or ""
    if not isinstance(formation,str): return []
    if not re.fullmatch(r"[345](?:-[1-5]){1,4}",formation): return []
    shape=[1]+[int(v) for v in formation.split("-")]
    if len(starters)!=11 or sum(shape)!=11: return []
    points=[]
    for p in starters:
        pos=p.get("horizontalLayout") or {}
        x,y=pos.get("x"),pos.get("y")
        if not isinstance(x,(int,float)) or not isinstance(y,(int,float)) or not(0<=x<=1 and 0<=y<=1): return []
        points.append((x,y,p))
    points.sort(key=lambda z:z[0])
    lines=[]; offset=0
    for count in shape:
        line=points[offset:offset+count];offset+=count
        if max(z[0] for z in line)-min(z[0] for z in line)>.07: return []
        if lines and min(z[0] for z in line)-max(z[0] for z in lines[-1])<.05:return []
        lines.append(sorted(line,key=lambda z:z[1]))
    out=[]
    for i,line in enumerate(lines):
        n=len(line)
        for j,(x,y,p) in enumerate(line):
            # Side from the provider's consistent horizontal layout. Use the
            # formation line and rank, not the registered fantasy position.
            flank=n>=3 and j in (0,n-1)
            side=("L" if j==0 else "R") if flank else "C"
            if i==0: role="GK"
            elif i==1:
                role=("FB" if n==4 else "WB") if flank and n in (4,5) else "CB"
                if role=="CB" and n==3:side="C"
            elif i==len(lines)-1:
                role="W" if flank else "ST"
            elif i==len(lines)-2 and len(lines)>=5 and shape[-1]<=2:
                role="W" if flank else "AM"
            elif i==2 and shape[1]==3 and n>=4 and flank: role="WB"
            elif i==2 and len(lines)>=5 and n<=2: role="DM"
            elif flank and n>=4:role="WM"
            else:role="CM"
            explicit=explicit_role(p)
            # Literal specific labels override layout inference. Preserve
            # left/right only where explicitly known or geometrically clear.
            if explicit:
                role=explicit["role"]
                side=explicit["side"] or side
            out.append((p,role,side,f"formation:{formation};line:{i};x:{x:.3f};y:{y:.3f}"))
    return out

def main():
    records=[x for x in load("gw8-11-team-advanced-source-manifest.json")["matches"] if 9<=x["gameweek"]<=11]
    identity=load("gw9-11-role-identity-snapshot.json")["rows"]
    by={(int(w),int(m),int(t),int(provider)):(int(pid),float(mins)) for w,m,t,pid,provider,mins in identity}
    assert len(records)==27 and len(by)==len(identity)==844
    rows=[];failures=[];matches=[]
    for rec in records:
        mid=rec["match_id"];w=rec["gameweek"];src=rec["candidate_fotmob_url"]
        try:
            detail=None
            for candidate in candidates(fetch_html(src))[:5]:
                try:
                    d=read_json(candidate)
                    if verified_fixture(d,rec):detail=d;break
                except Exception: continue
            if detail is None:raise ValueError("fixture mismatch or source unavailable")
            lineup=(detail.get("content") or {}).get("lineup") or {}
            found=[]
            for label,tid in (("homeTeam",rec["home_team_id"]),("awayTeam",rec["away_team_id"])):
                team=lineup.get(label) or {}
                positions=slots(team)
                if len(positions)!=11:raise ValueError("ambiguous formation "+label+" "+str(team.get("formation")))
                for player,role,side,position in positions:
                    provider=int(player["id"])
                    match=by.get((w,mid,tid,provider))
                    if match is None:continue
                    pid,mins=match
                    found.append([w,mid,tid,pid,provider,mins,role,side,position])
            if len({r[3] for r in found})!=len(found):raise ValueError("duplicate player")
            rows.extend(found);matches.append(mid)
            print("ROLE_MATCH="+json.dumps({"match_id":mid,"rows":found},separators=(",",":")),flush=True)
        except Exception as exc:
            failures.append({"match_id":mid,"reason":str(exc)})
            print("ROLE_FAILURE="+json.dumps(failures[-1]),flush=True)
        time.sleep(.35)
    report={"season":"2026-27","observed_at":datetime.now(timezone.utc).isoformat(),"matches":len(matches),"rows":rows,"failures":failures}
    Path("gw9-11-tactical-role-audit.json").write_text(json.dumps(report,indent=2))
    print("ROLE_AUDIT_SUMMARY="+json.dumps({"matches":len(matches),"rows":len(rows),"failures":failures}),flush=True)
if __name__=="__main__":main()
