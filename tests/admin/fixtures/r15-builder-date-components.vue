<template>
  <div class="app-container">
    <el-form ref="formRef" :model="formData" :rules="rules" size="default" label-width="100px">
      <el-form-item label="时间选择" prop="field101">
        <el-time-picker v-model="formData.field101" format="HH:mm:ss" value-format="HH:mm:ss"
          :style="{width: '100%'}" placeholder="请选择时间选择" clearable></el-time-picker>
      </el-form-item>
      <el-form-item label="时间范围" prop="field102">
        <el-time-picker v-model="formData.field102" is-range format="HH:mm:ss" value-format="HH:mm:ss"
          :style="{width: '100%'}" start-placeholder="开始时间" end-placeholder="结束时间" range-separator="至"
          clearable></el-time-picker>
      </el-form-item>
      <el-form-item label="日期选择" prop="field103">
        <el-date-picker v-model="formData.field103" format="YYYY-MM-DD" value-format="YYYY-MM-DD"
          :style="{width: '100%'}" placeholder="请选择日期选择" clearable></el-date-picker>
      </el-form-item>
      <el-form-item label="日期范围" prop="field104">
        <el-date-picker type="daterange" v-model="formData.field104" format="YYYY-MM-DD"
          value-format="YYYY-MM-DD" :style="{width: '100%'}" start-placeholder="开始日期" end-placeholder="结束日期"
          range-separator="至" clearable></el-date-picker>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="submitForm">提交</el-button>
        <el-button @click="resetForm">重置</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>
<script setup>
const {
  proxy
} = getCurrentInstance()
const formRef = ref()
const data = reactive({
  formData: {
    field101: '09:30:00',
    field102: ["09:20:11", "10:20:11"],
    field103: '2026-11-18',
    field104: ["2026-11-18", "2026-12-18"],
  },
  rules: {
    field101: [{
      required: true,
      message: '请选择时间选择',
      trigger: 'change'
    }],
    field102: [{
      required: true,
      type: 'array',
      message: '请至少选择一个field102',
      trigger: 'change'
    }],
    field103: [{
      required: true,
      message: '请选择日期选择',
      trigger: 'change'
    }],
    field104: [{
      required: true,
      type: 'array',
      message: '请至少选择一个field104',
      trigger: 'change'
    }],
  }
})
const {
  formData,
  rules
} = toRefs(data)
/**
 * @name: 表单提交
 * @description: 表单提交方法
 * @return {*}
 */
function submitForm() {
  formRef.value.validate((valid) => {
    if (!valid) return
    // TODO 提交表单
  })
}
/**
 * @name: 表单重置
 * @description: 表单重置方法
 * @return {*}
 */
function resetForm() {
  formRef.value.resetFields()
}

</script>
<style>
</style>
