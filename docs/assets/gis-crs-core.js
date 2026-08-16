(function(global){
'use strict';
const A_WGS84=6378137, F_WGS84=1/298.257223563;
const A_GRS80=6378137, F_GRS80=1/298.257222101;
const K0=.9996;
function norm(value){
  let s=String(value||'EPSG:4326').trim().toUpperCase().replace(/\s+/g,'');
  const urn=s.match(/EPSG(?::|::)(\d+)/); if(urn)s=`EPSG:${urn[1]}`;
  if(/^\d+$/.test(s))s=`EPSG:${s}`;
  if(s==='CRS:84'||s==='OGC:CRS84'||s.includes('CRS84'))s='EPSG:4326';
  if(['WGS84','EPSG:900913','EPSG:102100','EPSG:102113','GOOGLE'].includes(s))s=s==='WGS84'?'EPSG:4326':'EPSG:3857';
  return s;
}
function parse(code){
  code=norm(code); const n=Number(code.split(':')[1]);
  if(code==='EPSG:4326')return {code,name:'WGS 84',kind:'geographic',units:'degrees',datum:'WGS84',ellipsoid:'WGS84'};
  if(code==='EPSG:3857')return {code,name:'WGS 84 / Web Mercator',kind:'mercator',units:'metres',datum:'WGS84',ellipsoid:'WGS84'};
  if(code==='EPSG:4283')return {code,name:'GDA94',kind:'geographic',units:'degrees',datum:'GDA94',ellipsoid:'GRS80',approximateDatum:true};
  if(code==='EPSG:7844')return {code,name:'GDA2020',kind:'geographic',units:'degrees',datum:'GDA2020',ellipsoid:'GRS80',approximateDatum:true};
  if(n>=32601&&n<=32660)return {code,name:`WGS 84 / UTM zone ${n-32600}N`,kind:'utm',zone:n-32600,south:false,units:'metres',datum:'WGS84',ellipsoid:'WGS84'};
  if(n>=32701&&n<=32760)return {code,name:`WGS 84 / UTM zone ${n-32700}S`,kind:'utm',zone:n-32700,south:true,units:'metres',datum:'WGS84',ellipsoid:'WGS84'};
  if(n>=28348&&n<=28358)return {code,name:`GDA94 / MGA zone ${n-28300}`,kind:'utm',zone:n-28300,south:true,units:'metres',datum:'GDA94',ellipsoid:'GRS80',approximateDatum:true};
  if(n>=7846&&n<=7859)return {code,name:`GDA2020 / MGA zone ${n-7800}`,kind:'utm',zone:n-7800,south:true,units:'metres',datum:'GDA2020',ellipsoid:'GRS80',approximateDatum:true};
  return null;
}
function ellipsoid(info){const grs=info?.ellipsoid==='GRS80';const a=grs?A_GRS80:A_WGS84,f=grs?F_GRS80:F_WGS84;return {a,f,e2:f*(2-f),ep2:(f*(2-f))/(1-f*(2-f))};}
function deg(v){return v*Math.PI/180} function rad(v){return v*180/Math.PI}
function mercFwd([lon,lat]){lat=Math.max(-85.0511287798,Math.min(85.0511287798,lat));return [A_WGS84*deg(lon),A_WGS84*Math.log(Math.tan(Math.PI/4+deg(lat)/2))];}
function mercInv([x,y]){return [rad(x/A_WGS84),rad(2*Math.atan(Math.exp(y/A_WGS84))-Math.PI/2)];}
function utmFwd(coord,info){
  const [lon,lat]=coord,{a,e2,ep2}=ellipsoid(info),phi=deg(lat),lam=deg(lon),lam0=deg(info.zone*6-183);
  const N=a/Math.sqrt(1-e2*Math.sin(phi)**2),T=Math.tan(phi)**2,C=ep2*Math.cos(phi)**2,A=Math.cos(phi)*(lam-lam0);
  const M=a*((1-e2/4-3*e2**2/64-5*e2**3/256)*phi-(3*e2/8+3*e2**2/32+45*e2**3/1024)*Math.sin(2*phi)+(15*e2**2/256+45*e2**3/1024)*Math.sin(4*phi)-(35*e2**3/3072)*Math.sin(6*phi));
  let x=500000+K0*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*ep2)*A**5/120);
  let y=K0*(M+N*Math.tan(phi)*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*ep2)*A**6/720));
  if(info.south)y+=10000000; return [x,y];
}
function utmInv(coord,info){
  let [x,y]=coord;x-=500000;if(info.south)y-=10000000;
  const {a,e2,ep2}=ellipsoid(info),M=y/K0,mu=M/(a*(1-e2/4-3*e2**2/64-5*e2**3/256));
  const e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
  const phi1=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*Math.sin(4*mu)+(151*e1**3/96)*Math.sin(6*mu)+(1097*e1**4/512)*Math.sin(8*mu);
  const N1=a/Math.sqrt(1-e2*Math.sin(phi1)**2),T1=Math.tan(phi1)**2,C1=ep2*Math.cos(phi1)**2,R1=a*(1-e2)/(1-e2*Math.sin(phi1)**2)**1.5,D=x/(N1*K0);
  const lat=phi1-(N1*Math.tan(phi1)/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D**4/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D**6/720);
  const lon=deg(info.zone*6-183)+(D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D**5/120)/Math.cos(phi1);
  return [rad(lon),rad(lat)];
}
function toWgs(coord,from){const info=parse(from);if(!info)throw Error(`Unsupported CRS: ${from}`);if(info.kind==='geographic')return [Number(coord[0]),Number(coord[1]),...coord.slice(2)];if(info.kind==='mercator')return [...mercInv(coord),...coord.slice(2)];if(info.kind==='utm')return [...utmInv(coord,info),...coord.slice(2)];throw Error(`Unsupported CRS: ${from}`)}
function fromWgs(coord,to){const info=parse(to);if(!info)throw Error(`Unsupported CRS: ${to}`);if(info.kind==='geographic')return [Number(coord[0]),Number(coord[1]),...coord.slice(2)];if(info.kind==='mercator')return [...mercFwd(coord),...coord.slice(2)];if(info.kind==='utm')return [...utmFwd(coord,info),...coord.slice(2)];throw Error(`Unsupported CRS: ${to}`)}
function transformCoordinate(coord,from,to){from=norm(from);to=norm(to);if(from===to)return coord.slice();return fromWgs(toWgs(coord,from),to);}
function mapCoords(coords,fn){if(!Array.isArray(coords))return coords;if(coords.length>=2&&Number.isFinite(Number(coords[0]))&&Number.isFinite(Number(coords[1])))return fn(coords.map(Number));return coords.map(c=>mapCoords(c,fn));}
function transformGeometry(g,from,to){if(!g)return g;if(g.type==='GeometryCollection')return {...g,geometries:(g.geometries||[]).map(x=>transformGeometry(x,from,to))};return {...g,coordinates:mapCoords(g.coordinates,c=>transformCoordinate(c,from,to))};}
function transformFeatureCollection(fc,from,to){return {...fc,crs:to==='EPSG:4326'?undefined:{type:'name',properties:{name:norm(to)}},features:(fc.features||[]).map(f=>({...f,geometry:transformGeometry(f.geometry,from,to)}))};}
function detectGeoJSONCrs(data){const n=data?.crs?.properties?.name||data?.crs?.properties?.href||'';if(n)return norm(n);return 'EPSG:4326';}
function detectWktCrs(wkt){const s=String(wkt||'');const auth=[...s.matchAll(/AUTHORITY\s*\[\s*["']EPSG["']\s*,\s*["'](\d+)["']/gi)].pop();if(auth)return `EPSG:${auth[1]}`;const id=[...s.matchAll(/ID\s*\[\s*["']EPSG["']\s*,\s*(\d+)/gi)].pop();if(id)return `EPSG:${id[1]}`;if(/GDA2020.*MGA.*(?:ZONE\s*)?(\d{2})/i.test(s))return `EPSG:${7800+Number(RegExp.$1)}`;if(/GDA94.*MGA.*(?:ZONE\s*)?(\d{2})/i.test(s))return `EPSG:${28300+Number(RegExp.$1)}`;if(/WGS[_ ]?84.*UTM.*ZONE\s*(\d{1,2})([NS])/i.test(s))return `EPSG:${(RegExp.$2.toUpperCase()==='S'?32700:32600)+Number(RegExp.$1)}`;return null;}
function utmForLonLat(lon,lat,datum='WGS84'){const zone=Math.max(1,Math.min(60,Math.floor((lon+180)/6)+1));if(datum==='GDA2020'&&lat<0&&zone>=46&&zone<=59)return `EPSG:${7800+zone}`;if(datum==='GDA94'&&lat<0&&zone>=48&&zone<=58)return `EPSG:${28300+zone}`;return `EPSG:${(lat<0?32700:32600)+zone}`;}
function bboxCenter(b){return [(b[0]+b[2])/2,(b[1]+b[3])/2]}
function catalog(){const out=[parse('EPSG:4326'),parse('EPSG:3857'),parse('EPSG:4283'),parse('EPSG:7844')];for(let z=48;z<=58;z++)out.push(parse(`EPSG:${28300+z}`));for(let z=46;z<=59;z++)out.push(parse(`EPSG:${7800+z}`));return out.filter(Boolean);}
function asFeatureCollection(data){if(data?.type==='FeatureCollection')return data;if(data?.type==='Feature')return {type:'FeatureCollection',features:[data]};if(data?.type&&data.coordinates)return {type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:data}]};throw Error('Expected GeoJSON FeatureCollection, Feature or Geometry.');}
function prepareGeoJSON(data){const sourceCrs=detectGeoJSONCrs(data),raw=asFeatureCollection(data);if(sourceCrs!=='EPSG:4326'){if(!parse(sourceCrs))throw Error(`Unsupported GeoJSON CRS: ${sourceCrs}`);return {sourceCrs,storageCrs:'EPSG:4326',transformed:true,collection:transformFeatureCollection(raw,sourceCrs,'EPSG:4326')};}return {sourceCrs:'EPSG:4326',storageCrs:'EPSG:4326',transformed:false,collection:{...raw,crs:undefined}};}
function wktDefinition(code){const i=parse(code);if(!i)return null;if(i.code==='EPSG:4326')return 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]';if(i.code==='EPSG:4283')return 'GEOGCS["GDA94",DATUM["Geocentric_Datum_of_Australia_1994",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","4283"]]';if(i.code==='EPSG:7844')return 'GEOGCS["GDA2020",DATUM["Geocentric_Datum_of_Australia_2020",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","7844"]]';if(i.code==='EPSG:3857')return 'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1],AUTHORITY["EPSG","3857"]]';if(i.kind==='utm'){const base=i.datum==='GDA94'?wktDefinition('EPSG:4283'):i.datum==='GDA2020'?wktDefinition('EPSG:7844'):wktDefinition('EPSG:4326');return `PROJCS["${i.name}",${base},PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",${i.zone*6-183}],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",${i.south?10000000:0}],UNIT["metre",1],AUTHORITY["EPSG","${i.code.split(':')[1]}"]]`;}return null;}
function geometryToWkt(g){const n=v=>Number(v).toFixed(10).replace(/\.?0+$/,'');const c=p=>p.slice(0,2).map(n).join(' '),line=a=>'('+a.map(c).join(', ')+')';if(!g)return 'GEOMETRYCOLLECTION EMPTY';if(g.type==='Point')return `POINT (${c(g.coordinates)})`;if(g.type==='MultiPoint')return `MULTIPOINT (${g.coordinates.map(p=>'('+c(p)+')').join(', ')})`;if(g.type==='LineString')return `LINESTRING ${line(g.coordinates)}`;if(g.type==='MultiLineString')return `MULTILINESTRING (${g.coordinates.map(line).join(', ')})`;if(g.type==='Polygon')return `POLYGON (${g.coordinates.map(line).join(', ')})`;if(g.type==='MultiPolygon')return `MULTIPOLYGON (${g.coordinates.map(poly=>'('+poly.map(line).join(', ')+')').join(', ')})`;if(g.type==='GeometryCollection')return `GEOMETRYCOLLECTION (${(g.geometries||[]).map(geometryToWkt).join(', ')})`;throw Error(`Unsupported geometry type: ${g.type}`);}
const api=Object.freeze({version:'1.56.1',normalise:norm,parse,catalog,transformCoordinate,transformGeometry,transformFeatureCollection,detectGeoJSONCrs,detectWktCrs,prepareGeoJSON,wktDefinition,geometryToWkt,utmForLonLat,bboxCenter,supported:c=>!!parse(c)});
global.EditPolygonCRS=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
