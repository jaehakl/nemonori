# 포켓몬 마블 데이터 출처

포켓몬 마블은 게임 실행 중 외부 API를 호출하지 않습니다. 기본 종 1,025종의
한국어·영어 이름, 타입, 종족값, 레벨업 기술표, 진화 정보와 기본 정면 스프라이트를
아래 고정 버전에서 가져왔습니다.

- 데이터: [PokéAPI/pokeapi](https://github.com/PokeAPI/pokeapi/tree/bc92d3b6029ef1abe9e7ad424c400b338f3c11fe), `bc92d3b6029ef1abe9e7ad424c400b338f3c11fe`
- 이미지: [PokéAPI/sprites](https://github.com/PokeAPI/sprites/tree/bfb75391935310368065096fa08c51e8970bc43e), `bfb75391935310368065096fa08c51e8970bc43e`
- 데이터 라이선스 원문: [POKEAPI-LICENSE.txt](./POKEAPI-LICENSE.txt)

Pokémon과 Pokémon 캐릭터 이름은 Nintendo의 상표입니다. 스프라이트는 PokéAPI
저장소에서 배포하는 원본 파일을 수정하지 않고 사용합니다. 해당 저장소는
650번 이후 B&W 스타일 스프라이트에 기여한 Smogon 커뮤니티와 9세대 기본 정면
스프라이트를 제공한 KingOfThe-X-Roads에게 감사를 명시합니다. 자세한 이미지
출처는 위 스프라이트 저장소의 README를 참조하세요.

## 다시 가져오기

프로젝트 루트에서 Node.js 24 이상으로 실행합니다.

```sh
node scripts/import-pokemon-data.mjs
node --test tests/pokemon-data.test.mjs
```

가져오기 도구는 고정 커밋의 CSV와 PNG만 다운로드합니다. 내려받은 원본은 운영체제의
임시 폴더 `nemonori-pokemon-import`에 커밋별로 캐시합니다. 생성물은
`app/games/_components/pokemon-marble/generated/catalog.ts`와 현재 폴더의
`sprites/`에 저장합니다. 원본 CSV, 최종 카탈로그, 1,025개 PNG의 SHA-256 해시는
`generated/provenance.json`에 기록되며 테스트에서 생성물의 무결성을 확인합니다.

## 게임용 변환

- 도감 번호 1~1,025의 기본 포켓몬만 사용합니다. 리전폼과 메가진화 등 별도 폼은 제외합니다.
- 종마다 레벨업 기록이 존재하는 가장 최근 버전 그룹의 기술표를 사용합니다. 위력이 양수인
  물리·특수 공격만 남기며 중복 기술의 습득 레벨은 가장 낮은 값을 사용합니다.
- 보유 레벨 이하 기술 중 위력이 높은 순서로 서로 다른 타입을 먼저 골라 최대 세 개를
  구성합니다. 남는 자리는 같은 타입의 공격기로 채우며 무상성 기본 공격을 항상 제공합니다.
- 일반 레벨업 진화의 요구 레벨은 유지하고 돌·교환·친밀도·시간 등 추가 조건은 레벨 20으로
  대체합니다. 가장 최근의 기본 진화 조건과 종 단위 진화 관계를 사용합니다.
- 별도 리전폼을 생성하지 않으므로 나이킹·마임꽁꽁 등 리전폼에서만 이어지는 새로운 종도
  해당 기본 종에서 진화할 수 있습니다. 이때 단순 레벨 조건은 원래 레벨을 유지합니다.
- 게임의 공격은 원작 기술의 부가 효과, PP, 명중률, 급소, 우선도, 반동을 적용하지 않습니다.
