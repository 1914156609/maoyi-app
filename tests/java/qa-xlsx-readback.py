import pathlib,sys,zipfile,xml.etree.ElementTree as E,json,hashlib,shutil
source=pathlib.Path(sys.argv[1]);label=sys.argv[2];expected=sys.argv[3] if len(sys.argv)>3 else None
if not label.replace('-','').replace('_','').isalnum():raise ValueError('Invalid evidence label')
target=pathlib.Path('.data/qa/api-evidence')/(label+'.xlsx');shutil.copyfile(source,target);ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(target) as z:
 strings=[''.join(n.itertext()) for n in E.fromstring(z.read('xl/sharedStrings.xml')).findall('x:si',ns)] if 'xl/sharedStrings.xml' in z.namelist() else [];rows=[]
 for row in E.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//x:row',ns):
  cells=[]
  for c in row.findall('x:c',ns):
   col=0
   for char in ''.join(ch for ch in c.attrib.get('r','') if ch.isalpha()):col=col*26+ord(char)-64
   while len(cells)<col:cells.append('')
   v=c.find('x:v',ns);text=v.text if v is not None else ''
   if c.attrib.get('t')=='s':text=strings[int(text)]
   if c.attrib.get('t')=='inlineStr':text=''.join(c.find('x:is',ns).itertext())
   cells[col-1]=text
  rows.append(cells)
result={'release':'qa-20261118-'+label.split('-ui-')[0],'kind':'xlsx data validation only, not visual validation','source':str(source),'copy':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'rows':rows,'dataRows':len(rows)-1,'onlyExpectedId':(len(rows)==2 and float(rows[1][0])==float(expected)) if expected else None,'sensitiveColumns':[h for h in rows[0] if any(x in h.lower() for x in ['password','密码','token','密钥','openid'])]}
(target.with_suffix('.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='rows'},ensure_ascii=False))
