export function mountAssessment({host, state, observations, save, submit}) {
  const form = document.createElement('form');
  form.className = 'functional-assessment';
  const evidence = document.createElement('details');
  const title = document.createElement('summary');
  title.textContent = '查看本轮已取得的客观证据';
  evidence.append(title);
  for (const text of observations.length ? observations : ['本轮尚无客观记录。请说明还需要补查什么。']) {
    const p = document.createElement('p');
    p.textContent = text;
    evidence.append(p);
  }
  form.append(evidence);
  const draft = {...state.assessmentDraft};
  const fields = [
    ['diagnosis', '用运动学语言描述右侧功能问题。哪些发现支持机械性松弛？哪些提示力量或姿势控制不足？'],
    ['reasoning', '足弓承重降低可能怎样改变力线？结合足印或步态，写出一个解释、一项尚未测得的量，以及验证办法。']
  ];
  for (const [key, prompt] of fields) {
    const label = document.createElement('label'), input = document.createElement('textarea');
    label.textContent = prompt;
    input.name = key;
    input.rows = 3;
    input.required = true;
    input.value = draft[key] || '';
    input.addEventListener('input', () => {
      draft[key] = input.value;
      state.assessmentDraft = {...draft};
      input.setCustomValidity('');
      save();
    });
    label.append(input);
    form.append(label);
  }
  const next = document.createElement('button');
  next.type = 'submit';
  next.textContent = '记录评定，制定计划';
  form.append(next);
  form.onsubmit = event => {
    event.preventDefault();
    for (const [key] of fields) {
      if (!form.elements[key].value.trim()) {
        form.elements[key].setCustomValidity('请写下您的判断或需补查的信息。');
        form.reportValidity();
        return;
      }
    }
    submit(Object.fromEntries(fields.map(([key]) => [key, form.elements[key].value.trim()])));
  };
  host.append(form);
}
