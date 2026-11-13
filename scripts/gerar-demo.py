"""Gera public/demo/dados.json: a demonstração que roda no navegador, sem servidor.
Uso: com a API local de pé (DEMO=true), rode  python scripts/gerar-demo.py
O app desloca as datas para "hoje" na hora de abrir, então o arquivo não envelhece."""
import json, urllib.request

API = 'http://localhost:8090/api'

def chamar(caminho, token=None, corpo=None):
    req = urllib.request.Request(API + caminho, method='POST' if corpo is not None else 'GET',
                                 data=json.dumps(corpo).encode() if corpo is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})})
    with urllib.request.urlopen(req) as r:
        j = json.load(r)
    assert j.get('sucesso'), (caminho, j)
    return j.get('dados')

chamar('/demo/restaurar', corpo={})
saida = {'perfis': {}, 'rotas': {}}
for perfil in ['motorista', 'pais', 'aluno', 'escola']:
    s = chamar('/auth/demo', corpo={'perfil': perfil})
    pacote = chamar('/sync', s['token'])
    saida['perfis'][perfil] = {'usuario': s['usuario'], 'sync': pacote}
    saida['hoje'] = pacote['hoje']
    if perfil == 'motorista':
        for rota in ['/conformidade', '/conformidade/historico?dias=90', '/conformidade/historico?dias=30']:
            saida['rotas'][rota] = chamar(rota, s['token'])
open('public/demo/dados.json', 'w', encoding='utf-8').write(json.dumps(saida, ensure_ascii=False, separators=(',', ':')))
print('ok', saida['hoje'], round(len(json.dumps(saida)) / 1024), 'KB')
