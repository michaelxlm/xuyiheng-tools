/* ==========================================================================
   scientific.js · 科学计算器纯计算内核（无 DOM）
   ========================================================================== */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/result'));
  else {
    root.Tools = root.Tools || {};
    root.Tools.scientific = factory(root.ToolCore.Result);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Result) {
  'use strict';

  var METHODS = {
    factorial: '阶乘', sqrt: '平方根', sin: '正弦', cos: '余弦', tan: '正切',
    atan: '反正切', log: '自然对数', exp: '指数', abs: '绝对值', round: '四舍五入', ceil: '向上取整'
  };
  var TRIG = { sin: 1, cos: 1, tan: 1, atan: 1 };
  var SINGULAR_TOLERANCE = 1e-12;

  function numberValue(value, label) {
    if (value == null || String(value).trim() === '') throw new Error('请输入' + label);
    var n = Number(value);
    if (!Number.isFinite(n)) throw new Error(label + '必须是有限数值');
    return n;
  }

  function factorial(n) {
    if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error('阶乘仅支持 0~170 的整数');
    var out = 1;
    for (var i = 2; i <= n; i++) out *= i;
    return out;
  }

  function calculate(options) {
    var o = options || {};
    var source = { name: 'ECMAScript Math 本地计算内核', standard: 'IEEE 754 双精度浮点', version: '2026.11' };
    try {
      var method = String(o.method || '');
      if (!METHODS[method]) throw new Error('请选择支持的运算类型');
      var input = numberValue(o.value, '数值');
      var angleMode = o.angleMode === 'deg' ? 'deg' : 'rad';
      var radians = input;
      var resultUnit = '';
      var formula = '';

      if (method === 'factorial') {
        var fact = factorial(input);
        return Result.create('scientific', {
          metrics: { value: fact, input: input, method: method, angleMode: angleMode, resultUnit: '', engine: 'local' },
          details: [Result.detail('运算', METHODS[method]), Result.detail('输入', input), Result.detail('结果', fact)],
          formula: 'n! = 1 × 2 × … × n；0! = 1',
          assumptions: ['仅接受 0~170 的整数', '使用双精度浮点数，170! 已接近可表示上限'],
          source: source,
          precision: { significantDigits: 15 },
          limitations: ['超过 170 的阶乘会溢出为 Infinity，因此不予计算'],
        });
      }

      if (method === 'sqrt') {
        if (input < 0) throw new Error('平方根要求数值 ≥ 0；负数在实数范围内无结果');
        var sqrt = Math.sqrt(input);
        formula = '√n';
        return Result.create('scientific', {
          metrics: { value: sqrt, input: input, method: method, angleMode: angleMode, resultUnit: '', engine: 'local' },
          details: [Result.detail('运算', METHODS[method]), Result.detail('输入', input), Result.detail('结果', sqrt)],
          formula: formula,
          assumptions: ['按非负实数平方根计算'],
          source: source,
          precision: { significantDigits: 15 },
          limitations: ['负数平方根属于复数范围，本工具不返回伪实数'],
        });
      }

      if (method === 'log') {
        if (input <= 0) throw new Error('自然对数要求数值 > 0');
        var log = Math.log(input);
        return Result.create('scientific', {
          metrics: { value: log, input: input, method: method, angleMode: angleMode, resultUnit: '', engine: 'local' },
          details: [Result.detail('运算', METHODS[method]), Result.detail('输入', input), Result.detail('结果', log)],
          formula: 'ln(n) = logₑ(n)',
          assumptions: ['输入必须大于 0', '结果使用自然对数，不以 10 为底'],
          source: source,
          precision: { significantDigits: 15 },
          limitations: ['ln(0) 在实数范围内无定义'],
        });
      }

      if (method === 'exp') {
        var exp = Math.exp(input);
        if (!Number.isFinite(exp)) throw new Error('指数结果超出双精度浮点数可表示范围');
        return Result.create('scientific', {
          metrics: { value: exp, input: input, method: method, angleMode: angleMode, resultUnit: '', engine: 'local' },
          details: [Result.detail('运算', METHODS[method]), Result.detail('输入', input), Result.detail('结果', exp)],
          formula: 'eⁿ',
          assumptions: ['以自然常数 e 为底'],
          source: source,
          precision: { significantDigits: 15 },
          limitations: ['超出可表示范围时阻止计算，不显示 Infinity'],
        });
      }

      if (TRIG[method]) {
        // atan 的输入是正切比值，不是角度；DEG/RAD 只决定其输出单位。
        if (method !== 'atan' && angleMode === 'deg') radians = input * Math.PI / 180;
        var value;
        if (method === 'sin') value = Math.sin(radians);
        else if (method === 'cos') value = Math.cos(radians);
        else if (method === 'tan') {
          if (Math.abs(Math.cos(radians)) < SINGULAR_TOLERANCE) throw new Error('正切在该角度无定义');
          value = Math.tan(radians);
        } else {
          value = Math.atan(radians);
          if (angleMode === 'deg') value = value * 180 / Math.PI;
          resultUnit = angleMode === 'deg' ? '°' : 'rad';
        }
        formula = method === 'atan'
          ? (angleMode === 'deg' ? 'arctan(n) 的结果由弧度转换为角度' : 'arctan(n)')
          : (angleMode === 'deg' ? '先将输入角度 × π/180 转为弧度，再计算 ' + method + '(n)' : method + '(n)');
        return Result.create('scientific', {
          metrics: { value: value, input: input, method: method, angleMode: angleMode, resultUnit: resultUnit, engine: 'local' },
          details: [
            Result.detail('运算', METHODS[method]),
            Result.detail('输入', input, method === 'atan' ? '正切比值' : (angleMode === 'deg' ? '°' : 'rad')),
            Result.detail('结果', value, resultUnit),
            Result.detail('角度口径', method === 'atan'
              ? (angleMode === 'deg' ? 'DEG：反正切输出为角度' : 'RAD：反正切输出为弧度')
              : (angleMode === 'deg' ? 'DEG：三角函数输入为角度' : 'RAD：三角函数输入为弧度')),
          ],
          formula: formula,
          assumptions: ['sin/cos/tan 的 DEG/RAD 控制输入；atan 的 DEG/RAD 只控制输出', 'atan 输入始终是正切比值，不是角度', '正切奇点按 1e-12 容差判断'],
          source: source,
          precision: { significantDigits: 15 },
          limitations: ['浮点数计算存在舍入误差', '正切在 90°、270° 等奇点无定义'],
        });
      }

      if (method === 'abs') {
        var abs = Math.abs(input);
        formula = '|n|';
      } else if (method === 'round') {
        var round = Math.round(input);
        formula = 'round(n)';
      } else if (method === 'ceil') {
        var ceil = Math.ceil(input);
        formula = 'ceil(n)';
      } else {
        throw new Error('不支持的运算类型');
      }
      var simple = method === 'abs' ? abs : (method === 'round' ? round : ceil);
      return Result.create('scientific', {
        metrics: { value: simple, input: input, method: method, angleMode: angleMode, resultUnit: '', engine: 'local' },
        details: [Result.detail('运算', METHODS[method]), Result.detail('输入', input), Result.detail('结果', simple)],
        formula: formula,
        assumptions: ['按双精度浮点数运算'],
        source: source,
        precision: { significantDigits: 15 },
        limitations: ['结果显示可按科学计数法缩写，复制值保留完整精度'],
      });
    } catch (error) {
      return Result.invalid('scientific', error.message || '科学计算参数不合法', source);
    }
  }

  return { calculate: calculate, methods: METHODS, trig: TRIG };
});
