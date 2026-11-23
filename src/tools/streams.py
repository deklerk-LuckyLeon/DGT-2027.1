# Finds likely stream crossings along the route from the terrain grid in d3b.json (priority-flood fill, D8 flow,
# accumulation >= 0.5 km2) and writes them to d3b.json as 'streams'. Run from src/app: python3 ../tools/streams.py
import json,base64,struct,heapq,math
d=json.load(open('d3b.json')); g=d['grid']; nx,nz,x0,z0,st=g['nx'],g['nz'],g['x0'],g['z0'],g['step']
raw=base64.b64decode(g['h']); H=list(struct.unpack('<%dH'%(len(raw)//2),raw)); assert len(H)==nx*nz
r=d['route']
def hz(x,z):
    i=round((x-x0)/st); j=round((z-z0)/st); i=max(0,min(nx-1,i)); j=max(0,min(nz-1,j)); return H[j*nx+i]
diffs=[abs(hz(r['x'][k],r['z'][k])-r['e'][k]) for k in range(0,len(r['x']),50)]
print('median grid vs route elev diff',sorted(diffs)[len(diffs)//2])
N=nx*nz
# priority-flood fill so water always finds a way out
F=H[:]; seen=bytearray(N); pq=[]
for j in range(nz):
    for i in range(nx):
        if i in (0,nx-1) or j in (0,nz-1):
            k=j*nx+i; heapq.heappush(pq,(F[k],k)); seen[k]=1
nb=[(-1,-1),(0,-1),(1,-1),(-1,0),(1,0),(-1,1),(0,1),(1,1)]
while pq:
    e,k=heapq.heappop(pq); i=k%nx; j=k//nx
    for di,dj in nb:
        a,b=i+di,j+dj
        if 0<=a<nx and 0<=b<nz:
            kk=b*nx+a
            if not seen[kk]:
                seen[kk]=1
                if F[kk]<=e: F[kk]=e+0.001 if isinstance(e,float) else e+0.001
                heapq.heappush(pq,(F[kk],kk))
# D8 direction and accumulation (in cells)
down=[-1]*N
for j in range(nz):
    for i in range(nx):
        k=j*nx+i; best=0; bk=-1
        for di,dj in nb:
            a,b=i+di,j+dj
            if 0<=a<nx and 0<=b<nz:
                kk=b*nx+a; s=(F[k]-F[kk])/(st*1000*(1.414 if di and dj else 1))
                if s>best: best=s; bk=kk
        down[k]=bk
order=sorted(range(N),key=lambda k:-F[k]); acc=[1]*N
for k in order:
    if down[k]>=0: acc[down[k]]+=acc[k]
cellkm2=st*st
# route crossings: where the line passes a drainage cell, keep the biggest catchment per crossing
def cell(x,z):
    i=round((x-x0)/st); j=round((z-z0)/st)
    if 0<=i<nx and 0<=j<nz: return j*nx+i
    return -1
cross=[]
X,Z,K=r['x'],r['z'],r['km']
for t in range(len(X)):
    best=0; bc=-1
    i0=round((X[t]-x0)/st); j0=round((Z[t]-z0)/st)
    for di in (-1,0,1):
        for dj in (-1,0,1):
            a,b=i0+di,j0+dj
            if 0<=a<nx and 0<=b<nz:
                kk=b*nx+a; cx=x0+a*st; cz=z0+b*st
                if math.hypot(cx-X[t],cz-Z[t])<=st*0.75 and acc[kk]>best: best=acc[kk]; bc=kk
    cross.append((K[t],best*cellkm2,bc))
for thr in (0.3,0.5,1.0,2.0):
    pts=[]; last=-9
    for km,a,c in cross:
        if a>=thr:
            if km-last>0.8: pts.append([km,a,c]); 
            elif a>pts[-1][1]: pts[-1]=[km,a,c]
            last=km
    gaps=[]; prev=0
    for p in pts: gaps.append(p[0]-prev); prev=p[0]
    gaps.append(K[-1]-prev)
    seg=[p for p in pts if 44<p[0]<133]
    print(thr,'km2:',len(pts),'crossings, longest gap %.1f km'%max(gaps),' in km 44-133:',len(seg))
thr=0.5; pts=[]; last=-9
for t,(km,a,c) in enumerate(cross):
    if a>=thr:
        if km-last>0.8: pts.append([km,a,t])
        elif a>pts[-1][1]: pts[-1]=[km,a,t]
        last=km
# drop ones sitting on a GPX water point already
wp=[p['km'] for p in d['pois'] if p['c']=='water']
out=[]
for km,a,t in pts:
    if any(abs(km-w)<0.6 for w in wp): continue
    out.append({'km':round(km,1),'x':round(X[t],3),'z':round(Z[t],3),'a':round(a,1)})
d['streams']=out
json.dump(d,open('d3b.json','w'),separators=(',',':'))
print(len(out)); print([(o['km'],o['a']) for o in out])
