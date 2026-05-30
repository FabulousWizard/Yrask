# Üraski riskikaart – Dockeriga käivitamine

See versioon kasutab `veebileht` kausta Lovable/TanStack projekti põhjana ning integreerib sinna RMK, EELIS ja ilmaandmed.

## Käivitamine

```powershell
cd "C:\tee\sinu\kaustani\final_yrask_project"
docker compose up --build
```

Ava brauseris:

```text
http://localhost:8080
```

## Olulisemad muudatused

- Temperatuuriandmeid ei kuvata enam kaardi peal.
- Temperatuur, tuul, tuulesuund ja hinnanguline üraski kandumise suund kuvatakse parempoolses infotabelis.
- Kaardi popup'id on eemaldatud; RMK kahjustusalal, EELIS punktil või maakonna piirkonnas klikkimine saadab info infotabelisse.
- Levikusuunda näitavad tugevamad oranžid nooled.
- Maakonna rippmenüü jääb idle/valiku olekusse ja liigutab ainult kaardi vaadet; infotabel arvestab kaardil klikitud objekti või piirkonda.
